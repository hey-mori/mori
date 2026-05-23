import { describe, expect, it } from "vitest";
import {
  canSeeRecord,
  filterByActorVisibility,
  LOCAL_ACTOR,
} from "./actorVisibilityFilter";

describe("canSeeRecord", () => {
  it("treats a record with no visibility as personal (creator-only)", () => {
    expect(canSeeRecord({})).toBe(true);
    expect(
      canSeeRecord(
        { createdBy: "user-bob" },
        { actorId: "user-alice", isProjectMember: true },
      ),
    ).toBe(false);
  });

  it("lets any project member see team-visibility records", () => {
    const record = { visibility: "team" as const, createdBy: "user-bob" };
    expect(
      canSeeRecord(record, { actorId: "user-alice", isProjectMember: true }),
    ).toBe(true);
    expect(
      canSeeRecord(record, { actorId: "user-eve", isProjectMember: false }),
    ).toBe(false);
  });

  it("lets any caller see shared-visibility records (client-safe upstream)", () => {
    const record = { visibility: "shared" as const, createdBy: "user-bob" };
    expect(
      canSeeRecord(record, { actorId: "user-eve", isProjectMember: false }),
    ).toBe(true);
  });

  it("only lets the creator see personal records", () => {
    const record = { visibility: "personal" as const, createdBy: "user-bob" };
    expect(
      canSeeRecord(record, { actorId: "user-bob", isProjectMember: true }),
    ).toBe(true);
    expect(
      canSeeRecord(record, { actorId: "user-alice", isProjectMember: true }),
    ).toBe(false);
  });

  it("defaults the actor to LOCAL_ACTOR so single-user paths stay one-line", () => {
    expect(canSeeRecord({ createdBy: "local-user" })).toBe(true);
    expect(canSeeRecord({ createdBy: LOCAL_ACTOR.actorId })).toBe(true);
  });
});

describe("filterByActorVisibility", () => {
  it("returns only records the actor can see, preserving input order", () => {
    const records = [
      { id: "a", visibility: "team" as const, createdBy: "bob" },
      { id: "b", visibility: "personal" as const, createdBy: "bob" },
      { id: "c", visibility: "shared" as const, createdBy: "bob" },
      { id: "d", createdBy: "alice" },
    ];
    const result = filterByActorVisibility(records, {
      actorId: "alice",
      isProjectMember: true,
    });
    expect(result.map((r) => r.id)).toEqual(["a", "c", "d"]);
  });

  it("returns the whole list for the default local actor on plain records", () => {
    // Records that omit visibility default to personal+local — so every
    // record is visible to the default LOCAL_ACTOR. We attach an
    // explicit `createdBy` so each row satisfies the VisibilityRecord
    // constraint (all-optional types still need a property in common to
    // pass TS' literal-arg check).
    const records = [
      { id: "a", createdBy: "local-user" },
      { id: "b", createdBy: "local-user" },
      { id: "c", createdBy: "local-user" },
    ];
    expect(filterByActorVisibility(records).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
