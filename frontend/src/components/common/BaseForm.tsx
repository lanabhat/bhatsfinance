import type { ReactNode } from 'react'
import { Card } from '../ui/Card'
import { ValidationMessage } from './ValidationMessage'

type Props = {
  title: string
  description?: string
  error?: string
  children: ReactNode
}

export function BaseForm({ title, description, error, children }: Props) {
  return (
    <Card title={title} subtitle={description}>
      {error && <div className="mb-3"><ValidationMessage message={error} /></div>}
      <div className="space-y-3">
        {children}
      </div>
    </Card>
  )
}
