<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'

const authStore = useAuthStore()
const isLoggedIn = computed(() => authStore.isAuthenticated)

const features = [
  {
    icon: '🎯',
    title: 'Smart Matchmaking',
    description: 'Generate fair 2v2 matchups with teammate and opponent constraints'
  },
  {
    icon: '📊',
    title: 'ELO Ratings',
    description: 'Track player skill with Serious ELO or fun Catch-Up mode'
  },
  {
    icon: '🏆',
    title: 'Live Rankings',
    description: 'See real-time standings, win rates, and match history'
  },
  {
    icon: '⚡',
    title: 'Quick Scoring',
    description: 'Enter scores on the go and complete events in seconds'
  }
]
</script>

<template>
  <div class="home">
    <!-- Hero Section -->
    <section class="hero">
      <div class="container">
        <div class="hero-content">
          <span class="badge">🏓 For Pickleball Enthusiasts</span>
          <h1>
            Fair Matchups,<br/>
            <span class="gradient">Real Rankings</span>
          </h1>
          <p class="subtitle">
            Generate balanced 2v2 pickleball games, track ratings with ELO, 
            and see who really dominates your league.
          </p>
          <div class="hero-actions">
            <router-link v-if="isLoggedIn" to="/groups">
              <BaseButton size="lg">Go to Dashboard</BaseButton>
            </router-link>
            <router-link v-else to="/login">
              <BaseButton size="lg">Get Started Free</BaseButton>
            </router-link>
          </div>
        </div>
        <div class="hero-visual">
          <div class="court-container">
            <!-- Court shadow/glow -->
            <div class="court-glow"></div>
            
            <!-- Main court -->
            <div class="court">
              <!-- Court surface -->
              <div class="court-surface">
                <!-- Kitchen zones (non-volley) -->
                <div class="kitchen kitchen-top"></div>
                <div class="kitchen kitchen-bottom"></div>
                
                <!-- Service areas -->
                <div class="service-area service-top-left"></div>
                <div class="service-area service-top-right"></div>
                <div class="service-area service-bottom-left"></div>
                <div class="service-area service-bottom-right"></div>
                
                <!-- Court lines -->
                <div class="line baseline-top"></div>
                <div class="line baseline-bottom"></div>
                <div class="line sideline-left"></div>
                <div class="line sideline-right"></div>
                <div class="line kitchen-line-top"></div>
                <div class="line kitchen-line-bottom"></div>
                <div class="line centerline-top"></div>
                <div class="line centerline-bottom"></div>
                
                <!-- Net -->
                <div class="net">
                  <div class="net-post left"></div>
                  <div class="net-mesh"></div>
                  <div class="net-post right"></div>
                </div>
                
                <!-- Players -->
                <div class="player p1">
                  <div class="player-body"></div>
                  <div class="paddle"></div>
                </div>
                <div class="player p2">
                  <div class="player-body"></div>
                  <div class="paddle"></div>
                </div>
                <div class="player p3">
                  <div class="player-body"></div>
                  <div class="paddle"></div>
                </div>
                <div class="player p4">
                  <div class="player-body"></div>
                  <div class="paddle"></div>
                </div>
                
                <!-- Ball -->
                <div class="ball"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features">
      <div class="container">
        <h2>Everything you need to run your league</h2>
        <div class="features-grid">
          <div v-for="feature in features" :key="feature.title" class="feature-card">
            <span class="feature-icon">{{ feature.icon }}</span>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta">
      <div class="container">
        <div class="cta-content">
          <h2>Ready to elevate your game nights?</h2>
          <p>Start tracking your group's rankings today. It's free!</p>
          <router-link v-if="!isLoggedIn" to="/login">
            <BaseButton size="lg">Create Your League</BaseButton>
          </router-link>
          <router-link v-else to="/groups">
            <BaseButton size="lg">View Your Groups</BaseButton>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  overflow-x: hidden;
}

/* Hero */
.hero {
  padding: var(--spacing-xl) 0;
  display: flex;
  align-items: center;
}

.hero .container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-xl);
  align-items: center;
}

.badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: var(--radius-full);
  font-size: 0.875rem;
  color: var(--color-primary);
  margin-bottom: var(--spacing-md);
}

.hero h1 {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: var(--spacing-md);
}

.gradient {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 1.125rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 480px;
  margin-bottom: var(--spacing-lg);
}

.hero-actions {
  display: flex;
  gap: var(--spacing-md);
}

.hero-visual {
  display: flex;
  justify-content: center;
  align-items: stretch;
  perspective: 1000px;
}

.court-container {
  position: relative;
  width: 100%;
  max-width: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.court-glow {
  position: absolute;
  inset: -20px;
  background: radial-gradient(ellipse at center, rgba(16, 185, 129, 0.2) 0%, transparent 70%);
  filter: blur(20px);
  z-index: 0;
}

.court {
  position: relative;
  width: 100%;
  aspect-ratio: 10/13;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  border-radius: var(--radius-lg);
  padding: 12px;
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: rotateX(5deg);
  z-index: 1;
}

.court-surface {
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* Kitchen zones (non-volley zone) - lighter blue, 7ft from net on 44ft court = ~16% each side */
.kitchen {
  position: absolute;
  left: 0;
  right: 0;
  height: 16%;
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
}

.kitchen-top {
  top: 34%;
}

.kitchen-bottom {
  bottom: 34%;
}

/* Service areas - alternating shades */
.service-area {
  position: absolute;
  width: 50%;
  background: rgba(30, 64, 175, 0.3);
}

.service-top-left {
  top: 0;
  left: 0;
  height: 34%;
}

.service-top-right {
  top: 0;
  right: 0;
  height: 34%;
  background: rgba(37, 99, 235, 0.2);
}

.service-bottom-left {
  bottom: 0;
  left: 0;
  height: 34%;
  background: rgba(37, 99, 235, 0.2);
}

.service-bottom-right {
  bottom: 0;
  right: 0;
  height: 34%;
}

/* Court lines */
.line {
  position: absolute;
  background: white;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.baseline-top {
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}

.baseline-bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
}

.sideline-left {
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}

.sideline-right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}

.kitchen-line-top {
  top: 34%;
  left: 0;
  right: 0;
  height: 2px;
}

.kitchen-line-bottom {
  bottom: 34%;
  left: 0;
  right: 0;
  height: 2px;
}

.centerline-top {
  top: 0;
  left: 50%;
  width: 2px;
  height: 34%;
  transform: translateX(-50%);
}

.centerline-bottom {
  bottom: 0;
  left: 50%;
  width: 2px;
  height: 34%;
  transform: translateX(-50%);
}

/* Net */
.net {
  position: absolute;
  top: 50%;
  left: -4px;
  right: -4px;
  height: 4px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
}

.net-post {
  width: 8px;
  height: 20px;
  background: linear-gradient(180deg, #d4d4d4 0%, #737373 100%);
  border-radius: 2px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.net-post.left {
  margin-left: 0;
}

.net-post.right {
  margin-right: 0;
}

.net-mesh {
  flex: 1;
  height: 16px;
  background: 
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 4px,
      rgba(255, 255, 255, 0.3) 4px,
      rgba(255, 255, 255, 0.3) 5px
    ),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(255, 255, 255, 0.2) 3px,
      rgba(255, 255, 255, 0.2) 4px
    );
  background-color: rgba(255, 255, 255, 0.1);
  border-top: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* Players */
.player {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 10;
}

.player-body {
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 50%;
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.3),
    inset 0 2px 4px rgba(255, 255, 255, 0.2);
  animation: playerBounce 2s ease-in-out infinite;
}

.paddle {
  position: absolute;
  width: 14px;
  height: 8px;
  background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
  border-radius: 4px 4px 2px 2px;
  top: 50%;
  right: -8px;
  transform: translateY(-50%) rotate(-15deg);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.player.p1 { top: 15%; left: 30%; }
.player.p2 { top: 15%; left: 70%; }
.player.p3 { top: 85%; left: 30%; }
.player.p4 { top: 85%; left: 70%; }

.player.p1 .player-body { animation-delay: 0s; }
.player.p2 .player-body { animation-delay: 0.5s; }
.player.p3 .player-body { animation-delay: 0.25s; }
.player.p4 .player-body { animation-delay: 0.75s; }

.player.p1 .paddle { transform: translateY(-50%) rotate(15deg); right: auto; left: -8px; }
.player.p3 .paddle { transform: translateY(-50%) rotate(15deg); right: auto; left: -8px; }

/* Ball */
.ball {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  background: radial-gradient(circle at 30% 30%, #fef08a 0%, #facc15 50%, #ca8a04 100%);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2);
  animation: ballFloat 3s ease-in-out infinite;
  z-index: 15;
}

.ball::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  background: repeating-conic-gradient(
    from 0deg,
    transparent 0deg 30deg,
    rgba(0, 0, 0, 0.1) 30deg 60deg
  );
}

@keyframes playerBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes ballFloat {
  0%, 100% { 
    transform: translate(-50%, -50%) scale(1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  50% { 
    transform: translate(-50%, -50%) scale(1.15) translateY(-8px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
  }
}

/* Features */
.features {
  padding: var(--spacing-xl) 0;
  background: var(--color-bg-secondary);
}

.features h2 {
  font-size: 1.75rem;
  text-align: center;
  margin-bottom: var(--spacing-lg);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-lg);
}

.feature-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  text-align: center;
  transition: all var(--transition-fast);
}

.feature-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-4px);
}

.feature-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: var(--spacing-sm);
}

.feature-card h3 {
  font-size: 1.125rem;
  margin-bottom: var(--spacing-sm);
}

.feature-card p {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

/* CTA */
.cta {
  padding: var(--spacing-xl) 0;
}

.cta-content {
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}

.cta h2 {
  font-size: 1.5rem;
  margin-bottom: var(--spacing-sm);
}

.cta p {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

/* Responsive */
@media (max-width: 1024px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .hero .container {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .hero h1 {
    font-size: 2.5rem;
  }

  .subtitle {
    margin: 0 auto var(--spacing-xl);
  }

  .hero-actions {
    justify-content: center;
  }

  .hero-visual {
    order: -1;
  }

  .court-container {
    max-width: 240px;
  }

  .court {
    transform: rotateX(5deg);
  }

  .player-body {
    width: 18px;
    height: 18px;
  }

  .paddle {
    width: 10px;
    height: 6px;
  }

  .ball {
    width: 12px;
    height: 12px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>