/**
 * GameControlsSectionExtended.test.jsx
 * Extended coverage for GameControlsSection — EV Overlay and Share Range modal.
 * Does NOT duplicate tests already in SidebarSections.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('../components/HandConfigPanel', () => ({
  default: () => <div data-testid="hand-config-panel" />,
}))

vi.mock('../components/RangeMatrix', () => ({
  RangeMatrix: ({ selected, onToggle, colorMode }) => (
    <div data-testid="range-matrix" data-mode={colorMode}>
      {[...selected].map(g => (
        <button key={g} data-testid={`cell-${g}`} onClick={() => onToggle(g)}>
          {g}
        </button>
      ))}
      <button data-testid="click-new-cell" onClick={() => onToggle('AKs')}>
        AKs
      </button>
    </div>
  ),
}))

function makeEmit(overrides = {}) {
  return {
    startGame: vi.fn(),
    resetHand: vi.fn(),
    togglePause: vi.fn(),
    setMode: vi.fn(),
    openConfigPhase: vi.fn(),
    toggleEquityDisplay: vi.fn(),
    shareRange: vi.fn(),
    ...overrides,
  }
}

async function renderSection(props = {}) {
  const { default: GameControlsSection } = await import(
    '../components/sidebar/GameControlsSection.jsx'
  )
  const emit = makeEmit(props.emitOverrides)
  const setEquityEnabled = props.setEquityEnabled ?? vi.fn()
  render(
    <GameControlsSection
      gameState={null}
      emit={emit}
      is_paused={false}
      phase="WAITING"
      equityEnabled={props.equityEnabled ?? false}
      setEquityEnabled={setEquityEnabled}
      showToPlayers={props.showToPlayers ?? false}
      {...(props.extraProps ?? {})}
    />
  )
  return { emit, setEquityEnabled }
}

// ── EV Overlay ────────────────────────────────────────────────────────────────

describe('GameControlsSection — EV Overlay', () => {
  it('renders "EV OVERLAY" label', async () => {
    await renderSection()
    expect(screen.getByText('EV OVERLAY')).toBeTruthy()
  })

  it('Coach pill has green/active styling when equityEnabled=true', async () => {
    await renderSection({ equityEnabled: true })
    const coachBtn = screen.getByText('Coach')
    // active: green text color
    expect(coachBtn.style.color).toBe('rgb(34, 197, 94)')
  })

  it('Coach pill has inactive styling when equityEnabled=false', async () => {
    await renderSection({ equityEnabled: false })
    const coachBtn = screen.getByText('Coach')
    expect(coachBtn.style.color).toBe('rgb(110, 118, 129)')
  })

  it('clicking Coach pill calls setEquityEnabled(true) when currently false', async () => {
    const { setEquityEnabled } = await renderSection({ equityEnabled: false })
    fireEvent.click(screen.getByText('Coach'))
    expect(setEquityEnabled).toHaveBeenCalledWith(true)
  })

  it('clicking Coach pill calls setEquityEnabled(false) when currently true', async () => {
    const { setEquityEnabled } = await renderSection({ equityEnabled: true })
    fireEvent.click(screen.getByText('Coach'))
    expect(setEquityEnabled).toHaveBeenCalledWith(false)
  })

  it('Players pill has green/active styling when showToPlayers=true', async () => {
    await renderSection({ showToPlayers: true })
    const playersBtn = screen.getByText('Players')
    expect(playersBtn.style.color).toBe('rgb(34, 197, 94)')
  })

  it('Players pill has inactive styling when showToPlayers=false', async () => {
    await renderSection({ showToPlayers: false })
    const playersBtn = screen.getByText('Players')
    expect(playersBtn.style.color).toBe('rgb(110, 118, 129)')
  })

  it('clicking Players pill calls emit.toggleEquityDisplay()', async () => {
    const { emit } = await renderSection()
    fireEvent.click(screen.getByText('Players'))
    expect(emit.toggleEquityDisplay).toHaveBeenCalled()
  })
})

// ── Share Range ───────────────────────────────────────────────────────────────

describe('GameControlsSection — Share Range modal', () => {
  it('"⬡ Share Range" button is rendered', async () => {
    await renderSection()
    expect(screen.getByText('⬡ Share Range')).toBeTruthy()
  })

  it('clicking Share Range opens the modal', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    expect(screen.getByText('BROADCAST RANGE')).toBeTruthy()
    expect(screen.getByText('Broadcast')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('"BROADCAST RANGE" modal title is visible after opening', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    expect(screen.getByText('BROADCAST RANGE')).toBeTruthy()
  })

  it('clicking Cancel closes the modal', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('BROADCAST RANGE')).toBeNull()
  })

  it('clicking outside the modal overlay closes it', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    // The overlay div is the direct parent of the modal content box
    const overlay = screen.getByText('BROADCAST RANGE').closest('[style*="position: fixed"]')
    expect(overlay).toBeTruthy()
    // Simulate a click where target === currentTarget (clicking the backdrop)
    fireEvent.click(overlay, { target: overlay })
    expect(screen.queryByText('BROADCAST RANGE')).toBeNull()
  })

  it('label input is rendered and accepts text input', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    const input = screen.getByPlaceholderText('Label (e.g. BTN open range)')
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'BTN open' } })
    expect(input.value).toBe('BTN open')
  })

  it('Broadcast button is disabled when no hand groups selected', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    const broadcastBtn = screen.getByText('Broadcast')
    expect(broadcastBtn).toBeDisabled()
  })

  it('Broadcast button becomes enabled after selecting a cell', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    // Select a cell via the mock matrix
    fireEvent.click(screen.getByTestId('click-new-cell'))
    const broadcastBtn = screen.getByText('Broadcast')
    expect(broadcastBtn).not.toBeDisabled()
  })

  it('clicking Broadcast calls emit.shareRange with selected groups and label', async () => {
    const { emit } = await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    // Type a label
    const input = screen.getByPlaceholderText('Label (e.g. BTN open range)')
    fireEvent.change(input, { target: { value: 'Hero range' } })
    // Select a cell
    fireEvent.click(screen.getByTestId('click-new-cell'))
    // Broadcast
    fireEvent.click(screen.getByText('Broadcast'))
    expect(emit.shareRange).toHaveBeenCalledWith(['AKs'], 'Hero range')
  })

  it('modal closes after broadcast', async () => {
    await renderSection()
    fireEvent.click(screen.getByText('⬡ Share Range'))
    fireEvent.click(screen.getByTestId('click-new-cell'))
    fireEvent.click(screen.getByText('Broadcast'))
    expect(screen.queryByText('BROADCAST RANGE')).toBeNull()
  })

  it('matrix and label reset after broadcast', async () => {
    await renderSection()
    // First open — select + broadcast
    fireEvent.click(screen.getByText('⬡ Share Range'))
    const input = screen.getByPlaceholderText('Label (e.g. BTN open range)')
    fireEvent.change(input, { target: { value: 'Some label' } })
    fireEvent.click(screen.getByTestId('click-new-cell'))
    fireEvent.click(screen.getByText('Broadcast'))
    // Re-open
    fireEvent.click(screen.getByText('⬡ Share Range'))
    // Input should be blank again
    const input2 = screen.getByPlaceholderText('Label (e.g. BTN open range)')
    expect(input2.value).toBe('')
    // No selected-cell buttons should appear (Set was cleared)
    expect(screen.queryByTestId('cell-AKs')).toBeNull()
    // Broadcast should be disabled again
    expect(screen.getByText('Broadcast')).toBeDisabled()
  })
})
