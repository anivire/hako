import './styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@hako/ui'
import { ConfirmHost } from './lib/confirm'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { AppearanceProvider } from './lib/appearance'
import { i18nReady } from './lib/i18n'
import { queryClient } from './lib/queries'
import { router } from './router'

void i18nReady.then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppearanceProvider>
          <RouterProvider router={router} />
          <Toaster />
          <ConfirmHost />
        </AppearanceProvider>
      </QueryClientProvider>
    </StrictMode>,
  ),
)
