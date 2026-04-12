import React from 'react';

/**
 * BotSeatIndicator — small icon that visually distinguishes bot seats from
 * human seats in the game view.
 *
 * Props:
 *   isBot    — boolean; true renders a robot icon, false renders a person icon
 *   size     — number (default 14); icon font-size in px
 *   className — optional extra class names
 */
export default function BotSeatIndicator({ isBot, size = 14, className = '' }) {
  return (
    <span
      data-testid={isBot ? 'bot-seat-indicator' : 'human-seat-indicator'}
      aria-label={isBot ? 'Bot player' : 'Human player'}
      className={className}
      style={{ fontSize: size, lineHeight: 1, userSelect: 'none' }}
      title={isBot ? 'Bot' : 'Human'}
    >
      {isBot ? '🤖' : '👤'}
    </span>
  );
}
