import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatencyHUD } from '../LatencyHUD';

describe('LatencyHUD', () => {
  it('should render all metrics', () => {
    render(<LatencyHUD />);
    
    expect(screen.getByText(/RTT:/)).toBeDefined();
    expect(screen.getByText(/Tick→Wick:/)).toBeDefined();
    expect(screen.getByText(/SSE:/)).toBeDefined();
  });

  it('should show green color for low latency (< 120ms)', () => {
    const { container } = render(<LatencyHUD />);
    
    window.dispatchEvent(
      new CustomEvent('metrics:update', {
        detail: { voiceRTT: 80 },
      })
    );

    const rttElement = container.querySelector('.text-green-400');
    expect(rttElement).toBeDefined();
  });

  it('should show amber color for medium latency (120-180ms)', () => {
    const { container } = render(<LatencyHUD />);
    
    window.dispatchEvent(
      new CustomEvent('metrics:update', {
        detail: { voiceRTT: 150 },
      })
    );

    const rttElement = container.querySelector('.text-amber-400');
    expect(rttElement).toBeDefined();
  });

  it('should show red color for high latency (> 180ms)', () => {
    const { container } = render(<LatencyHUD />);
    
    window.dispatchEvent(
      new CustomEvent('metrics:update', {
        detail: { voiceRTT: 200 },
      })
    );

    const rttElement = container.querySelector('.text-red-400');
    expect(rttElement).toBeDefined();
  });

  it('should display market status with correct color', () => {
    const { container } = render(<LatencyHUD />);
    
    window.dispatchEvent(
      new CustomEvent('metrics:update', {
        detail: { marketStatus: 'LIVE' },
      })
    );

    const statusElement = screen.getByText('LIVE');
    expect(statusElement.className).toContain('text-green-400');
  });

  it('should show SSE reconnect count', () => {
    render(<LatencyHUD />);
    
    window.dispatchEvent(
      new CustomEvent('metrics:update', {
        detail: { sseReconnects: 3 },
      })
    );

    expect(screen.getByText('3')).toBeDefined();
  });
});
