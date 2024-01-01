-- Make resource internal_path relative (to MEMOS_DATA) and replace backslash with slash
-- This is a best-effort approach, but even if it fails, it won't break assets from loading
UPDATE resource
SET
  internal_path = REPLACE (internal_path, '\', '/')
WHERE
  internal_path LIKE '%assets\%';

UPDATE resource
SET
  internal_path = REPLACE (
    internal_path,
    SUBSTR (
      internal_path,
      1,
      INSTR (internal_path, '/assets')
    ),
    ''
  );
