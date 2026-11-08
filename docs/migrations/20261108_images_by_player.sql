-- Player photos move from one league membership (group_players.id) to the player (players.id),
-- so one photo shows in every league they play in. Idempotent: once moved, the joins match nothing.

-- A photo already saved under the new key (re-uploaded after deploy) wins over old ones.
DELETE FROM images i
USING group_players gp
WHERE i.kind = 'player' AND gp.id = i.ref_id
  AND EXISTS (SELECT 1 FROM images k WHERE k.kind = 'player' AND k.ref_id = gp.player_id);

-- A player with photos in several leagues keeps the newest one.
DELETE FROM images i
USING group_players gp, images j, group_players gq
WHERE i.kind = 'player' AND j.kind = 'player'
  AND gp.id = i.ref_id AND gq.id = j.ref_id
  AND gp.player_id = gq.player_id
  AND (j.updated_at, j.ref_id) > (i.updated_at, i.ref_id);

UPDATE images i
SET ref_id = gp.player_id
FROM group_players gp
WHERE i.kind = 'player' AND gp.id = i.ref_id;
