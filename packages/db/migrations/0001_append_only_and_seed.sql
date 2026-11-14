-- Append-only enforcement: financial event log and audit log can never be edited or deleted.
CREATE OR REPLACE FUNCTION near_district_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION near_district_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION near_district_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER vault_positions_append_only BEFORE UPDATE OR DELETE ON "vault_positions"
  FOR EACH ROW EXECUTE FUNCTION near_district_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER submission_reviews_append_only BEFORE UPDATE OR DELETE ON "submission_reviews"
  FOR EACH ROW EXECUTE FUNCTION near_district_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER campaign_versions_append_only BEFORE UPDATE OR DELETE ON "campaign_versions"
  FOR EACH ROW EXECUTE FUNCTION near_district_forbid_mutation();
--> statement-breakpoint
-- An eligibility snapshot is frozen the moment it is written.
CREATE TRIGGER eligibility_snapshots_frozen BEFORE DELETE ON "eligibility_snapshots"
  FOR EACH ROW EXECUTE FUNCTION near_district_forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION near_district_snapshot_only_tx_hash() RETURNS trigger AS $$
BEGIN
  IF NEW.participants IS DISTINCT FROM OLD.participants
     OR NEW.commitment IS DISTINCT FROM OLD.commitment
     OR NEW.participant_count IS DISTINCT FROM OLD.participant_count
     OR NEW.reward_period_id IS DISTINCT FROM OLD.reward_period_id THEN
    RAISE EXCEPTION 'eligibility snapshots are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER eligibility_snapshots_immutable BEFORE UPDATE ON "eligibility_snapshots"
  FOR EACH ROW EXECUTE FUNCTION near_district_snapshot_only_tx_hash();
--> statement-breakpoint
-- Money columns must never be negative (ledger deltas excepted).
ALTER TABLE "funding_orders" ADD CONSTRAINT funding_orders_amount_pos CHECK (amount > 0);
--> statement-breakpoint
ALTER TABLE "reward_allocations" ADD CONSTRAINT reward_allocations_amount_pos CHECK (amount > 0);
--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT withdrawal_requests_nonneg CHECK (principal_amount >= 0 AND yield_amount >= 0 AND bonus_amount >= 0);
--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT ledger_adjustments_two_person CHECK (approved_by IS NULL OR approved_by <> proposed_by);
--> statement-breakpoint
INSERT INTO "world_districts" ("id", "name", "tagline", "sort_order") VALUES
  ('discovery', 'Discovery Quarter', 'New projects and featured Spaces', 1),
  ('mystery', 'Lantern Row', 'Treasure hunts, clues and puzzles', 2),
  ('creators', 'Makers'' Yard', 'Creative challenges and idea contests', 3),
  ('community', 'Commons', 'Communities, DAOs and local groups', 4)
ON CONFLICT ("id") DO NOTHING;
