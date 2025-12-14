# Pickleball Frontend

Vue 3 + TypeScript frontend for the Pickleball Event Matchmaking & Ranking Platform.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required variables:
- `VITE_API_BASE_URL`: Backend API URL (e.g., `http://localhost:8000`)
- `VITE_CLERK_PUBLISHABLE_KEY`: Your Clerk publishable key

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Building for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

## Project Structure

```
src/
├── app/
│   ├── core/              # Cross-cutting concerns
│   │   ├── auth/          # Clerk integration
│   │   ├── http/          # API client
│   │   ├── layout/        # App layout
│   │   ├── models/        # DTOs
│   │   └── ui/            # Shared components
│   └── features/          # Feature modules
│       ├── auth/          # Login page
│       ├── events/        # Event management
│       ├── groups/        # Group management
│       ├── home/          # Landing page
│       ├── players/       # Player management
│       └── rankings/      # Rankings & history
├── router/                # Vue Router config
├── styles/                # Global styles
├── App.vue
└── main.ts
```

## Architecture (MVVM)

- **Views**: Vue components that render UI
- **Services**: API communication layer
- **DTOs**: Data transfer objects matching API contracts

Views interact with services directly for simplicity.

## Technologies

- Vue 3 (Composition API)
- TypeScript
- Vue Router
- Pinia (state management, if needed)
- Clerk (authentication)
- Vite (build tool)



