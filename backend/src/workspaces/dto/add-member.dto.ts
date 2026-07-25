import { IsEmail, IsIn } from "class-validator";
import type { WorkspaceRole } from "../../auth/auth.types";

const assignableRoles = ["admin", "member", "viewer"] as const;

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(assignableRoles)
  role!: Exclude<WorkspaceRole, "owner">;
}
