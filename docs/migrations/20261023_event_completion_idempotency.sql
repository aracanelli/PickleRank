-- Development-branch migration for RAX-4.
-- These constraints make event-scoped ranking and attendance side effects
-- idempotent even if two completion requests race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rating_updates_event_player
    ON rating_updates (event_id, group_player_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_payments_attendance_event_player
    ON sub_payments (event_id, group_player_id, payment_type)
    WHERE payment_type = 'ATTENDANCE';
