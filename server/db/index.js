'use strict';

/**
 * server/db/index.js — flat re-export of all DB symbols.
 *
 * Preserves the same export surface as the original HandLoggerSupabase.js so
 * all callers (`require('./db/HandLoggerSupabase')`) continue to work unchanged.
 * HandLoggerSupabase.js is now a thin shim pointing here.
 */

const HandRepo    = require('./repositories/HandRepository');
const PlayerRepo  = require('./repositories/PlayerRepository');
const PlaylistRepo = require('./repositories/PlaylistRepository');
const TagRepo     = require('./repositories/TagRepository');
const SessionRepo = require('./repositories/SessionRepository');
const { TableRepository } = require('./repositories/TableRepository');
const CRMRepo      = require('./repositories/CRMRepository');
const ScenarioRepo             = require('./repositories/ScenarioRepository');
const { TournamentRepository } = require('./repositories/TournamentRepository');
const { analyzeAndTagHand } = require('../game/AnalyzerService');

// Auth stubs (kept for test regression safety — not called in production)
async function registerPlayerAccount() {
  return { error: 'registration_disabled', message: 'Use Supabase Auth' };
}
async function loginPlayerAccount() {
  return { error: 'registration_disabled', message: 'Use Supabase Auth' };
}

module.exports = {
  // Session
  ensureSession:        SessionRepo.ensureSession,
  getSessionStats:      SessionRepo.getSessionStats,
  getSessionReport:     SessionRepo.getSessionReport,

  // Hand lifecycle
  startHand:            HandRepo.startHand,
  recordDeal:           HandRepo.recordDeal,
  recordAction:         HandRepo.recordAction,
  endHand:              HandRepo.endHand,
  markIncomplete:       HandRepo.markIncomplete,
  logStackAdjustment:   HandRepo.logStackAdjustment,
  markLastActionReverted: HandRepo.markLastActionReverted,

  // Hand queries
  getHands:             HandRepo.getHands,
  getHandDetail:        HandRepo.getHandDetail,

  // Player
  upsertPlayerIdentity:  PlayerRepo.upsertPlayerIdentity,
  getPlayerStats:        PlayerRepo.getPlayerStats,
  getAllPlayersWithStats: PlayerRepo.getAllPlayersWithStats,
  getPlayerHoverStats:   PlayerRepo.getPlayerHoverStats,
  getPlayerHands:        PlayerRepo.getPlayerHands,
  loginRosterPlayer:     PlayerRepo.loginRosterPlayer,
  isRegisteredPlayer:    PlayerRepo.isRegisteredPlayer,

  // Tags
  updateCoachTags:      TagRepo.updateCoachTags,

  // Playlists
  createPlaylist:          PlaylistRepo.createPlaylist,
  getPlaylists:            PlaylistRepo.getPlaylists,
  getPlaylistHands:        PlaylistRepo.getPlaylistHands,
  addHandToPlaylist:       PlaylistRepo.addHandToPlaylist,
  removeHandFromPlaylist:  PlaylistRepo.removeHandFromPlaylist,
  deletePlaylist:          PlaylistRepo.deletePlaylist,

  // Tables
  createTable:               TableRepository.createTable,
  getTable:                  TableRepository.getTable,
  listTables:                TableRepository.listTables,
  closeTable:                TableRepository.closeTable,
  updateTable:               TableRepository.updateTable,
  activateScheduledTables:   TableRepository.activateScheduledTables,

  // CRM
  getPlayerCRMSummary:    CRMRepo.getPlayerCRMSummary,
  createNote:             CRMRepo.createNote,
  getNotes:               CRMRepo.getNotes,
  setPlayerTags:          CRMRepo.setPlayerTags,
  getPlayerTags:          CRMRepo.getPlayerTags,
  createCoachingSession:  CRMRepo.createCoachingSession,
  getCoachingSessions:    CRMRepo.getCoachingSessions,
  updateSessionStatus:    CRMRepo.updateSessionStatus,
  upsertSnapshot:         CRMRepo.upsertSnapshot,
  getSnapshots:           CRMRepo.getSnapshots,

  // Scenario configs
  saveScenarioConfig:  ScenarioRepo.saveScenarioConfig,
  getScenarioConfigs:  ScenarioRepo.getScenarioConfigs,
  getScenarioConfig:   ScenarioRepo.getScenarioConfig,

  // Tournament
  createTournamentConfig:       TournamentRepository.createConfig,
  getTournamentConfig:          TournamentRepository.getConfig,
  recordTournamentElimination:  TournamentRepository.recordElimination,
  getTournamentStandings:       TournamentRepository.getStandings,

  // Analyzer
  analyzeAndTagHand,

  // Auth stubs
  registerPlayerAccount,
  loginPlayerAccount,
};
