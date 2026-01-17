<script setup lang="ts">
import { ArrowLeft, DollarSign, Check, Clock, AlertTriangle, History, Plus, Minus, RefreshCw } from 'lucide-vue-next'
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { paymentsApi } from '../services/payments.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { SubBalanceDto, GroupDto, PaymentHistoryResponse } from '@/app/core/models/dto'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import SkeletonLoader from '@/app/core/ui/components/SkeletonLoader.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'
import PullToRefresh from '@/app/core/ui/components/PullToRefresh.vue'

const route = useRoute()
const router = useRouter()

const groupId = computed(() => route.params.groupId as string)

const group = ref<GroupDto | null>(null)
const balances = ref<SubBalanceDto[]>([])
const totalOwed = ref(0)
const isLoading = ref(true)
const error = ref('')

// Modal states
const showPaymentModal = ref(false)
const showHistoryModal = ref(false)
const selectedPlayer = ref<SubBalanceDto | null>(null)
const paymentAmount = ref<number>(0)
const paymentNotes = ref('')
const isSubmitting = ref(false)
const paymentHistory = ref<PaymentHistoryResponse | null>(null)
const isLoadingHistory = ref(false)

// Backfill state
const isBackfilling = ref(false)
const backfillResult = ref<{ eventsProcessed: number; chargesCreated: number; totalAmount: number } | null>(null)

// Payment type for modal
const paymentType = ref<'payment' | 'adjustment'>('payment')

onMounted(async () => {
  await loadData()
})

async function loadData() {
  isLoading.value = true
  error.value = ''
  try {
    const groupRes = await groupsApi.get(groupId.value)
    group.value = groupRes
    
    // Check if payment tracking is enabled
    if (!groupRes.settings.paymentSettings?.trackPayments) {
      error.value = 'Payment tracking is not enabled for this group. Enable it in Group Settings.'
      return
    }
    
    const balancesRes = await paymentsApi.getBalances(groupId.value)
    balances.value = balancesRes.balances
    totalOwed.value = balancesRes.totalOwed
  } catch (e: any) {
    error.value = e.message || 'Failed to load payment data'
  } finally {
    isLoading.value = false
  }
}

async function refreshData() {
  await loadData()
}

function openPaymentModal(player: SubBalanceDto, type: 'payment' | 'adjustment' = 'payment') {
  selectedPlayer.value = player
  paymentType.value = type
  paymentAmount.value = type === 'payment' && player.balance < 0 ? Math.abs(player.balance) : 0
  paymentNotes.value = ''
  showPaymentModal.value = true
}

function closePaymentModal() {
  showPaymentModal.value = false
  selectedPlayer.value = null
  paymentAmount.value = 0
  paymentNotes.value = ''
}

async function submitPayment() {
  if (!selectedPlayer.value || paymentAmount.value <= 0) return
  
  isSubmitting.value = true
  try {
    if (paymentType.value === 'payment') {
      await paymentsApi.recordPayment(groupId.value, {
        groupPlayerId: selectedPlayer.value.groupPlayerId,
        amount: paymentAmount.value,
        notes: paymentNotes.value || undefined
      })
    } else {
      await paymentsApi.recordAdjustment(groupId.value, {
        groupPlayerId: selectedPlayer.value.groupPlayerId,
        amount: paymentAmount.value,
        notes: paymentNotes.value || undefined
      })
    }
    closePaymentModal()
    await loadData()
  } catch (e: any) {
    error.value = e.message || 'Failed to record payment'
  } finally {
    isSubmitting.value = false
  }
}

async function markAllPaid(player: SubBalanceDto) {
  if (player.balance >= 0) return
  
  isSubmitting.value = true
  try {
    await paymentsApi.markAllPaid(groupId.value, player.groupPlayerId)
    await loadData()
  } catch (e: any) {
    error.value = e.message || 'Failed to mark as paid'
  } finally {
    isSubmitting.value = false
  }
}

async function openHistoryModal(player: SubBalanceDto) {
  selectedPlayer.value = player
  showHistoryModal.value = true
  isLoadingHistory.value = true
  
  try {
    paymentHistory.value = await paymentsApi.getHistory(groupId.value, player.groupPlayerId)
  } catch (e: any) {
    error.value = e.message || 'Failed to load payment history'
  } finally {
    isLoadingHistory.value = false
  }
}

function closeHistoryModal() {
  showHistoryModal.value = false
  selectedPlayer.value = null
  paymentHistory.value = null
}

function formatCurrency(amount: number): string {
  const currency = group.value?.settings.paymentSettings?.currency || 'USD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getBalanceClass(balance: number): string {
  if (balance < 0) return 'owes'
  if (balance > 0) return 'credit'
  return 'paid'
}

// Check if payment tracking is enabled
const isPaymentTrackingEnabled = computed(() => {
  return group.value?.settings.paymentSettings?.trackPayments ?? false
})

async function backfillCharges() {
  if (!confirm('This will charge all subs for events they attended before payment tracking was enabled.\n\nEach sub will be charged the current fee per attendance for each event they participated in.\n\nContinue?')) {
    return
  }
  
  isBackfilling.value = true
  backfillResult.value = null
  error.value = ''
  
  try {
    const result = await paymentsApi.backfillCharges(groupId.value)
    backfillResult.value = result
    await loadData()
  } catch (e: any) {
    error.value = e.message || 'Failed to backfill charges'
  } finally {
    isBackfilling.value = false
  }
}

</script>

<template>
  <div class="payments-page container">
    <div class="page-header">
      <div class="header-left">
        <router-link :to="`/groups/${groupId}`" class="back-link">
          <ArrowLeft :size="16" /> Back to Group
        </router-link>
        <h1><DollarSign :size="32" class="page-title-icon" /> Sub Payments</h1>
        <p class="subtitle">Track and manage sub player payments</p>
      </div>
      <div class="header-right">
        <BaseButton
          v-if="!isLoading && isPaymentTrackingEnabled"
          variant="secondary"
          size="sm"
          @click="backfillCharges"
          :loading="isBackfilling"
        >
          <RefreshCw :size="14" /> Recalculate History
        </BaseButton>
        <div v-if="!isLoading && totalOwed > 0" class="total-owed">
          <span class="total-label">Total Owed:</span>
          <span class="total-value">{{ formatCurrency(totalOwed) }}</span>
        </div>
      </div>
    </div>

    <!-- Backfill Success Message -->
    <div v-if="backfillResult" class="success-banner">
      <Check :size="20" />
      <div class="success-content">
        <strong>Historical charges recalculated!</strong>
        <span>{{ backfillResult.eventsProcessed }} events processed, {{ backfillResult.chargesCreated }} charges created ({{ formatCurrency(backfillResult.totalAmount) }} total)</span>
      </div>
      <button class="dismiss-btn" @click="backfillResult = null">&times;</button>
    </div>

    <!-- Loading State -->
    <SkeletonLoader v-if="isLoading" :rows="5" class="mobile-skeleton" />
    <LoadingSpinner v-if="isLoading" text="Loading payment data..." class="desktop-spinner" />

    <!-- Error State -->
    <div v-else-if="error" class="error-container">
      <BaseCard class="error-card">
        <AlertTriangle :size="48" class="error-icon" />
        <p class="error-message">{{ error }}</p>
        <BaseButton v-if="!isPaymentTrackingEnabled" @click="router.push(`/groups/${groupId}/settings`)">
          Go to Settings
        </BaseButton>
      </BaseCard>
    </div>

    <!-- Empty State -->
    <EmptyState
      v-else-if="balances.length === 0"
      :icon="DollarSign"
      title="No sub players"
      description="When sub players attend events, their balances will appear here."
    />

    <!-- Main Content -->
    <template v-else>
      <PullToRefresh :on-refresh="refreshData" class="content-wrapper">
        <!-- Balance Cards -->
        <div class="balance-grid">
          <BaseCard 
            v-for="player in balances" 
            :key="player.groupPlayerId"
            class="balance-card"
            :class="getBalanceClass(player.balance)"
          >
            <div class="balance-header">
              <div class="player-info">
                <div class="player-avatar">{{ player.displayName[0] }}</div>
                <div class="player-details">
                  <span class="player-name">{{ player.displayName }}</span>
                  <span class="sub-badge">Sub</span>
                </div>
              </div>
              <div class="balance-amount" :class="getBalanceClass(player.balance)">
                <span v-if="player.balance < 0" class="balance-label">Owes</span>
                <span v-else-if="player.balance > 0" class="balance-label">Credit</span>
                <span v-else class="balance-label">Paid</span>
                <span class="balance-value">{{ formatCurrency(Math.abs(player.balance)) }}</span>
              </div>
            </div>

            <div class="balance-stats">
              <div class="stat">
                <span class="stat-label">Attendances</span>
                <span class="stat-value">{{ player.totalAttendances }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Total Charges</span>
                <span class="stat-value">{{ formatCurrency(player.totalCharges) }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Total Paid</span>
                <span class="stat-value">{{ formatCurrency(player.totalPayments) }}</span>
              </div>
            </div>

            <div v-if="player.lastPaymentDate" class="last-payment">
              <Clock :size="14" />
              Last payment: {{ formatDate(player.lastPaymentDate) }}
            </div>

            <div class="balance-actions">
              <BaseButton 
                variant="ghost" 
                size="sm"
                @click="openHistoryModal(player)"
              >
                <History :size="14" /> History
              </BaseButton>
              <BaseButton 
                v-if="player.balance < 0"
                variant="primary" 
                size="sm"
                @click="openPaymentModal(player, 'payment')"
              >
                <Plus :size="14" /> Record Payment
              </BaseButton>
              <BaseButton 
                v-if="player.balance < 0"
                variant="secondary" 
                size="sm"
                @click="markAllPaid(player)"
                :loading="isSubmitting"
              >
                <Check :size="14" /> Mark Paid
              </BaseButton>
              <BaseButton 
                variant="ghost" 
                size="sm"
                @click="openPaymentModal(player, 'adjustment')"
              >
                <Minus :size="14" /> Adjust
              </BaseButton>
            </div>
          </BaseCard>
        </div>
      </PullToRefresh>
    </template>

    <!-- Payment Modal -->
    <Teleport to="body">
      <div v-if="showPaymentModal" class="modal-overlay" @click.self="closePaymentModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>{{ paymentType === 'payment' ? 'Record Payment' : 'Record Adjustment' }}</h2>
            <button class="modal-close" @click="closePaymentModal">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-player-name">{{ selectedPlayer?.displayName }}</p>
            <p v-if="selectedPlayer && selectedPlayer.balance < 0" class="modal-balance">
              Current balance: <strong>{{ formatCurrency(Math.abs(selectedPlayer.balance)) }} owed</strong>
            </p>

            <div class="form-group">
              <label>Amount</label>
              <div class="amount-input-wrapper">
                <span class="currency-symbol">$</span>
                <input 
                  v-model.number="paymentAmount" 
                  type="number" 
                  step="0.01"
                  min="0"
                  class="amount-input"
                  placeholder="0.00"
                >
              </div>
            </div>

            <div class="form-group">
              <label>Notes (optional)</label>
              <textarea 
                v-model="paymentNotes" 
                class="notes-input"
                placeholder="Add any notes about this payment..."
                rows="2"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <BaseButton variant="ghost" @click="closePaymentModal">Cancel</BaseButton>
            <BaseButton 
              variant="primary" 
              @click="submitPayment"
              :loading="isSubmitting"
              :disabled="paymentAmount <= 0"
            >
              {{ paymentType === 'payment' ? 'Record Payment' : 'Save Adjustment' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- History Modal -->
    <Teleport to="body">
      <div v-if="showHistoryModal" class="modal-overlay" @click.self="closeHistoryModal">
        <div class="modal-content history-modal">
          <div class="modal-header">
            <h2>Payment History</h2>
            <button class="modal-close" @click="closeHistoryModal">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-player-name">{{ selectedPlayer?.displayName }}</p>
            <p v-if="paymentHistory" class="modal-balance">
              Current balance: 
              <strong :class="getBalanceClass(paymentHistory.currentBalance)">
                {{ paymentHistory.currentBalance < 0 ? formatCurrency(Math.abs(paymentHistory.currentBalance)) + ' owed' : formatCurrency(paymentHistory.currentBalance) }}
              </strong>
            </p>

            <LoadingSpinner v-if="isLoadingHistory" text="Loading history..." />
            
            <div v-else-if="paymentHistory && paymentHistory.history.length > 0" class="history-list">
              <div 
                v-for="item in paymentHistory.history" 
                :key="item.id"
                class="history-item"
                :class="item.paymentType.toLowerCase()"
              >
                <div class="history-item-main">
                  <div class="history-type">
                    <span v-if="item.paymentType === 'ATTENDANCE'" class="type-badge attendance">
                      Attendance
                    </span>
                    <span v-else-if="item.paymentType === 'PAYMENT'" class="type-badge payment">
                      Payment
                    </span>
                    <span v-else class="type-badge adjustment">
                      Adjustment
                    </span>
                    <span v-if="item.eventName" class="event-name">{{ item.eventName }}</span>
                  </div>
                  <span class="history-amount" :class="{ positive: item.amount > 0, negative: item.amount < 0 }">
                    {{ item.amount > 0 ? '+' : '' }}{{ formatCurrency(item.amount) }}
                  </span>
                </div>
                <div class="history-item-meta">
                  <span class="history-date">{{ formatDate(item.createdAt) }}</span>
                  <span v-if="item.notes" class="history-notes">{{ item.notes }}</span>
                </div>
              </div>
            </div>
            
            <EmptyState
              v-else-if="paymentHistory && paymentHistory.history.length === 0"
              :icon="History"
              title="No history"
              description="No payment records found for this player."
            />
          </div>
          <div class="modal-footer">
            <BaseButton variant="ghost" @click="closeHistoryModal">Close</BaseButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 6px 12px;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--transition-fast);
  margin-bottom: var(--spacing-sm);
}

.back-link:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.page-header h1 {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 2rem;
  margin-bottom: var(--spacing-xs);
}

.subtitle {
  color: var(--color-text-secondary);
}

.total-owed {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.total-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.total-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-error);
  font-family: var(--font-mono);
}

/* Success Banner */
.success-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-success);
  margin-bottom: var(--spacing-lg);
}

.success-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.success-content span {
  font-size: 0.875rem;
  opacity: 0.9;
}

.dismiss-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  color: var(--color-success);
  cursor: pointer;
  padding: var(--spacing-xs);
  line-height: 1;
  opacity: 0.7;
}

.dismiss-btn:hover {
  opacity: 1;
}

/* Error State */
.error-container {
  display: flex;
  justify-content: center;
  padding: var(--spacing-xl);
}

.error-card {
  text-align: center;
  padding: var(--spacing-xl);
  max-width: 400px;
}

.error-icon {
  color: var(--color-warning);
  margin-bottom: var(--spacing-md);
}

.error-message {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

/* Balance Grid */
.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-lg);
}

.balance-card {
  padding: var(--spacing-lg);
  transition: all var(--transition-fast);
}

.balance-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.balance-card.owes {
  border-left: 4px solid var(--color-error);
}

.balance-card.credit {
  border-left: 4px solid var(--color-success);
}

.balance-card.paid {
  border-left: 4px solid var(--color-text-muted);
}

.balance-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-md);
}

.player-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.player-avatar {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f59e0b;
  color: white;
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 1rem;
}

.player-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-name {
  font-weight: 600;
  font-size: 1rem;
}

.sub-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  width: fit-content;
}

.balance-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.balance-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 600;
}

.balance-amount.owes .balance-label {
  color: var(--color-error);
}

.balance-amount.credit .balance-label {
  color: var(--color-success);
}

.balance-amount.paid .balance-label {
  color: var(--color-text-muted);
}

.balance-value {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-mono);
}

.balance-amount.owes .balance-value {
  color: var(--color-error);
}

.balance-amount.credit .balance-value {
  color: var(--color-success);
}

.balance-amount.paid .balance-value {
  color: var(--color-text-muted);
}

.balance-stats {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--spacing-sm);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.stat-value {
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 0.875rem;
}

.last-payment {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-md);
}

.balance-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  justify-content: flex-end;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-md);
}

.modal-content {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
}

.modal-content.history-modal {
  max-width: 560px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  font-size: 1.25rem;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--spacing-xs);
  line-height: 1;
}

.modal-close:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: var(--spacing-lg);
}

.modal-player-name {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.modal-balance {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

.modal-balance strong.owes {
  color: var(--color-error);
}

.modal-balance strong.credit {
  color: var(--color-success);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: var(--spacing-xs);
  font-size: 0.875rem;
}

.amount-input-wrapper {
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.currency-symbol {
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border-right: 1px solid var(--color-border);
}

.amount-input {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  background: transparent;
  font-size: 1.25rem;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--color-text-primary);
}

.amount-input:focus {
  outline: none;
}

.notes-input {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-family: inherit;
  resize: vertical;
}

.notes-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

/* History List */
.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.history-item {
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-border);
}

.history-item.attendance {
  border-left-color: var(--color-error);
}

.history-item.payment {
  border-left-color: var(--color-success);
}

.history-item.adjustment {
  border-left-color: var(--color-warning);
}

.history-item-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-xs);
}

.history-type {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.type-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  width: fit-content;
}

.type-badge.attendance {
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
}

.type-badge.payment {
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-success);
}

.type-badge.adjustment {
  background: rgba(234, 179, 8, 0.15);
  color: var(--color-warning);
}

.event-name {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.history-amount {
  font-weight: 700;
  font-family: var(--font-mono);
}

.history-amount.positive {
  color: var(--color-success);
}

.history-amount.negative {
  color: var(--color-error);
}

.history-item-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-date {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.history-notes {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-style: italic;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }
  
  .header-right {
    width: 100%;
  }
  
  .total-owed {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }
  
  .balance-grid {
    grid-template-columns: 1fr;
  }
  
  .balance-actions {
    justify-content: center;
  }
  
  .desktop-spinner {
    display: none;
  }
}

@media (min-width: 769px) {
  .mobile-skeleton {
    display: none;
  }
}
</style>
