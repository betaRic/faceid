'use client'

import React from 'react'
import { ErrorState } from './ui'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error)
      }
      return <ErrorState description={this.state.error?.message || 'An unexpected error occurred'} onRetry={() => this.setState({ hasError: false, error: null })} />
    }
    return this.props.children
  }
}
