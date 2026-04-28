-- Migration 027: Add description column to schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS description TEXT;
