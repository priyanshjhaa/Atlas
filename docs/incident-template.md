# Atlas incident record

## Summary

- Incident identifier:
- Commander:
- Start time (UTC):
- Detection source:
- Current status:
- Affected workspaces and features:

## Immediate safety actions

- [ ] Stop deployments and background synchronization when continued writes
      could increase impact.
- [ ] Preserve API, worker, database, Redis, and provider telemetry.
- [ ] Record the active `ATLAS_RELEASE` and preceding known-good release.
- [ ] Revoke exposed credentials without copying their values into this record.
- [ ] Confirm `/v1/health` and capture the dependency state from `/v1/ready`.

## Timeline

| Time (UTC) | Observation or action | Owner | Evidence |
| --- | --- | --- | --- |
|  |  |  |  |

## Recovery decision

- Application rollback release:
- Database recovery point:
- Restore drill identifier and checksum:
- Validation owner:
- User communication owner:

## Resolution and follow-up

- Root cause:
- Customer impact:
- Data integrity result:
- Resolution:
- Detection improvements:
- Preventive actions, owners, and due dates:
