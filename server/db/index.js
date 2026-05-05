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
const { TableRepository, InvitedPlayersRepository, TablePresetsRepository } = require('./repositories/TableRepository');
const CRMRepo      = require('./repositories/CRMRepository');
const ScenarioRepo             = require('./repositories/ScenarioRepository');
const { TournamentRepository } = require('./repositories/TournamentRepository');
const ChipBankRepo = require('./repositories/ChipBankRepository');
const SchoolRepo   = require('./repositories/SchoolRepository');
const BotTableRepo = require('./repositories/BotTableRepository');
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
  getHandHistory:       HandRepo.getHandHistory,
  getDistinctHandTags:  HandRepo.getDistinctHandTags,
  getDistinctTableIds:  HandRepo.getDistinctTableIds,

  // Player
  upsertPlayerIdentity:  PlayerRepo.upsertPlayerIdentity,
  getPlayerStats:        PlayerRepo.getPlayerStats,
  getPlayerStatsByMode:  PlayerRepo.getPlayerStatsByMode,
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
  getPlaylist:             PlaylistRepo.getPlaylist,
  getPlaylistHands:        PlaylistRepo.getPlaylistHands,
  addHandToPlaylist:       PlaylistRepo.addHandToPlaylist,
  removeHandFromPlaylist:  PlaylistRepo.removeHandFromPlaylist,
  deletePlaylist:          PlaylistRepo.deletePlaylist,
  renamePlaylist:          PlaylistRepo.renamePlaylist,

  // Tables
  createTable:               TableRepository.createTable,
  getTable:                  TableRepository.getTable,
  listTables:                TableRepository.listTables,
  closeTable:                TableRepository.closeTable,
  updateTable:               TableRepository.updateTable,
  setController:             TableRepository.setController,
  activateScheduledTables:   TableRepository.activateScheduledTables,

  // Invited players (private tables)
  addInvite:                 InvitedPlayersRepository.addInvite,
  removeInvite:              InvitedPlayersRepository.removeInvite,
  listInvited:               InvitedPlayersRepository.listInvited,
  isInvited:                 InvitedPlayersRepository.isInvited,

  // Table presets
  saveTablePreset:           TablePresetsRepository.save,
  listTablePresets:          TablePresetsRepository.list,
  getTablePreset:            TablePresetsRepository.get,
  updateTablePreset:         TablePresetsRepository.update,
  deleteTablePreset:         TablePresetsRepository.delete,
  cloneTablePreset:          TablePresetsRepository.clone,

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

  // Chip bank (migration 015)
  getChipBalance:          ChipBankRepo.getBalance,
  getChipHistory:          ChipBankRepo.getTransactionHistory,
  chipReload:              ChipBankRepo.reload,
  chipBuyIn:               ChipBankRepo.buyIn,
  chipCashOut:             ChipBankRepo.cashOut,
  chipAdjustment:          ChipBankRepo.adjustment,

  // Schools (migration 017)
  schoolFindAll:          SchoolRepo.findAll,
  schoolFindById:         SchoolRepo.findById,
  schoolCreate:           SchoolRepo.create,
  schoolUpdate:           SchoolRepo.update,
  schoolArchive:          SchoolRepo.archive,
  schoolGetMembers:       SchoolRepo.getMembers,
  schoolGetMemberCounts:  SchoolRepo.getMemberCounts,
  schoolAssignPlayer:     SchoolRepo.assignPlayer,
  schoolRemovePlayer:     SchoolRepo.removePlayer,
  schoolCanAddCoach:      SchoolRepo.canAddCoach,
  schoolCanAddStudent:    SchoolRepo.canAddStudent,
  schoolGetFeatures:      SchoolRepo.getFeatures,
  schoolSetFeature:       SchoolRepo.setFeature,
  schoolBulkSetFeatures:  SchoolRepo.bulkSetFeatures,

  // Bot tables (migration 019)
  createBotTable:   BotTableRepo.createBotTable,
  getBotTables:     BotTableRepo.getBotTables,
  upsertBotPlayer:  BotTableRepo.upsertBotPlayer,

  // Analyzer
  analyzeAndTagHand,

  // Auth stubs
  registerPlayerAccount,
  loginPlayerAccount,
};
