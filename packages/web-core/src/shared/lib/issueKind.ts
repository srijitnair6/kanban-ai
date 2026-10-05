import type { Issue, JsonValue } from 'shared/remote-types';

/**
 * Epics and stories are modelled on top of `Issue.extension_metadata`:
 *   epic:  { kind: 'epic' }
 *   story: { kind: 'story', epic_id: '<epic issue id>' }
 * Stories are independent board cards that point at their epic; they are not
 * sub-issues. Issues without a kind are plain issues.
 *
 * Keep in sync with `crates/api-types/src/issue_kind.rs`.
 */
export type IssueKind = 'epic' | 'story';

/** Which kind of card the board shows. */
export type EntityView = 'epics' | 'stories';

type IssueMetadataSource = Pick<Issue, 'extension_metadata'>;

function metadataRecord(
  metadata: JsonValue | null | undefined
): Record<string, JsonValue> | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, JsonValue>;
  }
  return null;
}

export function getIssueKind(issue: IssueMetadataSource): IssueKind | null {
  const kind = metadataRecord(issue.extension_metadata)?.kind;
  if (typeof kind !== 'string') return null;
  const normalized = kind.trim().toLowerCase();
  return normalized === 'epic' || normalized === 'story' ? normalized : null;
}

export function isEpic(issue: IssueMetadataSource): boolean {
  return getIssueKind(issue) === 'epic';
}

export function isStory(issue: IssueMetadataSource): boolean {
  return getIssueKind(issue) === 'story';
}

/** The epic a story belongs to, or null (also null for non-stories). */
export function getEpicId(issue: IssueMetadataSource): string | null {
  if (getIssueKind(issue) !== 'story') return null;
  const epicId = metadataRecord(issue.extension_metadata)?.epic_id;
  return typeof epicId === 'string' && epicId.length > 0 ? epicId : null;
}

export function buildIssueMetadata(
  kind: IssueKind | null,
  epicId?: string | null
): JsonValue | null {
  if (kind === 'epic') return { kind: 'epic' };
  if (kind === 'story') {
    return epicId ? { kind: 'story', epic_id: epicId } : { kind: 'story' };
  }
  return null;
}

/** Issues shown for a given board view. Plain issues count as stories. */
export function matchesEntityView(
  issue: IssueMetadataSource,
  view: EntityView
): boolean {
  const epic = isEpic(issue);
  return view === 'epics' ? epic : !epic;
}

export function groupStoriesByEpic(issues: Issue[]): Map<string, Issue[]> {
  const byEpic = new Map<string, Issue[]>();
  for (const issue of issues) {
    const epicId = getEpicId(issue);
    if (!epicId) continue;
    const stories = byEpic.get(epicId);
    if (stories) {
      stories.push(issue);
    } else {
      byEpic.set(epicId, [issue]);
    }
  }
  return byEpic;
}

export interface EpicProgress {
  done: number;
  total: number;
}

export function getEpicProgress(
  stories: Issue[],
  doneStatusIds: ReadonlySet<string>
): EpicProgress {
  return {
    done: stories.filter((story) => doneStatusIds.has(story.status_id)).length,
    total: stories.length,
  };
}

/**
 * Planning statuses are where work has not started yet. Moving an epic to one of
 * them carries its not-yet-started stories along (done on the server).
 */
export function isPlanningStatusName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === 'backlog' || normalized === 'to do';
}

/** Starting point for the description of a new story. */
export const STORY_DESCRIPTION_TEMPLATE = `## Requirements

-

## Acceptance Criteria

- `;

export const EPIC_DESCRIPTION_TEMPLATE = `## Goal

-

## Scope

- `;

const ENTITY_VIEW_STORAGE_KEY = 'vk-kanban-entity-view';

export function loadEntityView(): EntityView {
  try {
    const stored = window.localStorage.getItem(ENTITY_VIEW_STORAGE_KEY);
    return stored === 'stories' ? 'stories' : 'epics';
  } catch {
    return 'epics';
  }
}

export function saveEntityView(view: EntityView): void {
  try {
    window.localStorage.setItem(ENTITY_VIEW_STORAGE_KEY, view);
  } catch {
    // Storage can be unavailable (private mode); the view just won't persist.
  }
}
