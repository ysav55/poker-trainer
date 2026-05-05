import React from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../lib/colors.js';

export default function QuickLinks({ role, isCoach, isAdmin, onCreateTable, onCreateTournament }) {
  const navigate = useNavigate();

  const coachLinks = [
    { label: 'Create Table', onClick: onCreateTable },
    { label: 'Students', onClick: () => navigate('/students') },
    { label: 'Scenarios', onClick: () => navigate('/admin/hands') },
    { label: 'Alerts', onClick: () => navigate('/admin/alerts') },
  ];

  const studentLinks = [
    { label: 'Join Table', onClick: () => navigate('/tables') },
    { label: 'Bot Practice', onClick: () => navigate('/tables?filter=bot') },
    { label: 'History', onClick: () => navigate('/history') },
    { label: 'Analysis', onClick: () => navigate('/analysis') },
  ];

  const adminLinks = [
    { label: 'Create Table', onClick: onCreateTable },
    { label: 'Users', onClick: () => navigate('/admin/users') },
    { label: 'Tournaments', onClick: () => navigate('/tournaments') },
    { label: 'Alerts', onClick: () => navigate('/admin/alerts') },
  ];

  const links = isAdmin ? adminLinks : isCoach ? coachLinks : studentLinks;

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: colors.textSecondary }}>
        Quick Links
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {links.map((link, i) => (
          <button
            key={i}
            onClick={link.onClick}
            className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
            style={{
              background: colors.bgSurfaceRaised,
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textPrimary,
            }}
          >
            {link.label}
          </button>
        ))}
      </div>
    </section>
  );
}
