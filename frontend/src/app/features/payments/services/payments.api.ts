import { api } from '@/app/core/http/api-client'
import type {
    SubBalanceListResponse,
    PaymentHistoryResponse,
    PaymentResponseDto
} from '@/app/core/models/dto'

export interface RecordPaymentRequest {
    groupPlayerId: string
    amount: number
    notes?: string
}

export interface RecordAdjustmentRequest {
    groupPlayerId: string
    amount: number
    notes?: string
}

export const paymentsApi = {
    /**
     * Get balance summaries for all sub players in a group
     */
    async getBalances(groupId: string): Promise<SubBalanceListResponse> {
        return api.get<SubBalanceListResponse>(`/api/groups/${groupId}/payments/balances`)
    },

    /**
     * Record a payment from a sub player
     */
    async recordPayment(groupId: string, data: RecordPaymentRequest): Promise<PaymentResponseDto> {
        const result = await api.post<PaymentResponseDto>(`/api/groups/${groupId}/payments`, data)
        api.invalidateCache(`/api/groups/${groupId}/payments/balances`)
        return result
    },

    /**
     * Record an adjustment (credit or debit) for a sub player
     */
    async recordAdjustment(groupId: string, data: RecordAdjustmentRequest): Promise<PaymentResponseDto> {
        const result = await api.post<PaymentResponseDto>(`/api/groups/${groupId}/payments/adjustment`, data)
        api.invalidateCache(`/api/groups/${groupId}/payments/balances`)
        return result
    },

    /**
     * Get payment history for a specific player
     */
    async getHistory(groupId: string, groupPlayerId: string): Promise<PaymentHistoryResponse> {
        return api.get<PaymentHistoryResponse>(`/api/groups/${groupId}/payments/${groupPlayerId}/history`)
    },

    /**
     * Zero out a player's balance by recording a payment for the full amount owed
     */
    async markAllPaid(groupId: string, groupPlayerId: string): Promise<PaymentResponseDto> {
        const result = await api.post<PaymentResponseDto>(`/api/groups/${groupId}/payments/${groupPlayerId}/mark-paid`)
        api.invalidateCache(`/api/groups/${groupId}/payments/balances`)
        return result
    },

    /**
     * Backfill attendance charges for all historical events
     */
    async backfillCharges(groupId: string): Promise<BackfillResult> {
        const result = await api.post<BackfillResult>(`/api/groups/${groupId}/payments/backfill`)
        api.invalidateCache(`/api/groups/${groupId}/payments/balances`)
        return result
    }
}

export interface BackfillResult {
    eventsProcessed: number
    chargesCreated: number
    totalAmount: number
    feePerAttendance: number
}
