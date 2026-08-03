import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const backupScript = join(
  repositoryRoot,
  "scripts/operations/database-backup.sh",
);
const restoreScript = join(
  repositoryRoot,
  "scripts/operations/database-restore.sh",
);

function makeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o700 });
  chmodSync(path, 0o700);
}

describe("database operations scripts", () => {
  it("creates a private custom-format backup and checksum", () => {
    const fixture = mkdtempSync(join(tmpdir(), "atlas-backup-"));
    const binaries = join(fixture, "bin");
    const backups = join(fixture, "backups");
    mkdirSync(binaries);
    makeExecutable(
      join(binaries, "pg_dump"),
      "#!/bin/sh\nwhile [ \"$#\" -gt 0 ]; do\n  if [ \"$1\" = \"--file\" ]; then shift; printf 'atlas-backup' > \"$1\"; exit 0; fi\n  shift\ndone\nexit 1\n",
    );

    const result = spawnSync("sh", [backupScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binaries}:${process.env.PATH}`,
        DATABASE_URL: "postgresql://user:secret@database.example/atlas",
        BACKUP_DIR: backups,
        ATLAS_RELEASE: "release/2026-08-03",
      },
    });

    expect(result.status).toBe(0);
    const files = readdirSync(backups);
    const backup = files.find((file) => file.endsWith(".dump"));
    expect(backup).toMatch(/release2026-08-03\.dump$/);
    expect(files).toContain(`${backup}.sha256`);
    expect(readFileSync(join(backups, backup!), "utf8")).toBe("atlas-backup");
  });

  it("requires explicit isolated-database confirmation", () => {
    const result = spawnSync("sh", [restoreScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        RESTORE_DATABASE_URL:
          "postgresql://user:secret@restore.example/atlas_restore",
        BACKUP_FILE: "/tmp/missing.dump",
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "RESTORE_CONFIRMATION=restore-isolated-database",
    );
  });

  it("refuses to restore over the configured production database", () => {
    const productionUrl =
      "postgresql://user:secret@database.example/atlas";
    const result = spawnSync("sh", [restoreScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: productionUrl,
        RESTORE_DATABASE_URL: productionUrl,
        BACKUP_FILE: "/tmp/missing.dump",
        RESTORE_CONFIRMATION: "restore-isolated-database",
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to restore over DATABASE_URL");
  });

  it("verifies the checksum before restoring an isolated database", () => {
    const fixture = mkdtempSync(join(tmpdir(), "atlas-restore-"));
    const binaries = join(fixture, "bin");
    const backup = join(fixture, "atlas.dump");
    const checksum = `${backup}.sha256`;
    const restoreLog = join(fixture, "restore.log");
    mkdirSync(binaries);
    writeFileSync(backup, "verified-atlas-backup");
    writeFileSync(
      checksum,
      `${createHash("sha256").update("verified-atlas-backup").digest("hex")}  atlas.dump\n`,
    );
    makeExecutable(
      join(binaries, "pg_restore"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$RESTORE_LOG"\n',
    );

    const result = spawnSync("sh", [restoreScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binaries}:${process.env.PATH}`,
        RESTORE_DATABASE_URL:
          "postgresql://user:secret@restore.example/atlas_restore",
        BACKUP_FILE: backup,
        RESTORE_CONFIRMATION: "restore-isolated-database",
        RESTORE_LOG: restoreLog,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${backup}: OK`);
    expect(readFileSync(restoreLog, "utf8")).toContain(
      "postgresql://user:secret@restore.example/atlas_restore",
    );
  });
});
