import { useCallback, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useProjectContext } from '@/shared/hooks/useProjectContext';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import {
  buildIssueMetadata,
  getEpicId,
  getIssueKind,
  isEpic,
  type IssueKind,
} from '@/shared/lib/issueKind';

interface IssueKindSectionContainerProps {
  /** The open issue, or null while creating a new one. */
  issueId: string | null;
  /** Kind of the issue being created (create mode only). */
  createKind: IssueKind | null;
  /** Epic picked for the story being created (create mode only). */
  createEpicId: string | null;
  onCreateEpicChange: (epicId: string | undefined) => void;
}

/**
 * Shows whether an issue is an epic or a story and lets a story pick or change
 * the epic it belongs to. Renders nothing for plain issues.
 */
export function IssueKindSectionContainer({
  issueId,
  createKind,
  createEpicId,
  onCreateEpicChange,
}: IssueKindSectionContainerProps) {
  const { projectId } = useParams({ strict: false });
  const appNavigation = useAppNavigation();
  const { issues, issuesById, updateIssue } = useProjectContext();

  const epics = useMemo(
    () =>
      issues
        .filter(isEpic)
        .sort(
          (a, b) =>
            a.sort_order - b.sort_order || a.issue_number - b.issue_number
        ),
    [issues]
  );

  const issue = issueId ? issuesById.get(issueId) : undefined;
  const kind = issueId ? (issue ? getIssueKind(issue) : null) : createKind;
  const epicId = issueId ? (issue ? getEpicId(issue) : null) : createEpicId;

  const handleEpicChange = useCallback(
    (nextEpicId: string) => {
      if (!issueId) {
        onCreateEpicChange(nextEpicId || undefined);
        return;
      }
      // A story always belongs to an epic, so clearing is not offered when editing.
      if (!nextEpicId) return;
      updateIssue(issueId, {
        extension_metadata: buildIssueMetadata('story', nextEpicId),
      });
    },
    [issueId, onCreateEpicChange, updateIssue]
  );

  const handleOpenEpic = useCallback(() => {
    if (projectId && epicId) {
      appNavigation.goToProjectIssue(projectId, epicId);
    }
  }, [projectId, epicId, appNavigation]);

  if (!kind) return null;

  return (
    <div className="flex flex-wrap items-center gap-base">
      <span className="rounded-sm bg-secondary px-half text-xs uppercase tracking-wide text-low">
        {kind === 'epic' ? 'Epic' : 'Story'}
      </span>
      {kind === 'story' && (
        <>
          <label className="text-sm text-low" htmlFor="story-epic-select">
            Epic
          </label>
          <select
            id="story-epic-select"
            value={epicId ?? ''}
            onChange={(e) => handleEpicChange(e.target.value)}
            className="min-w-0 flex-1 rounded-sm border bg-secondary px-base py-half text-sm text-normal"
          >
            {(!epicId || !issueId) && <option value="">Select an epic…</option>}
            {epics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.simple_id} · {epic.title}
              </option>
            ))}
          </select>
          {issueId && epicId && (
            <button
              type="button"
              onClick={handleOpenEpic}
              className="text-sm text-brand hover:underline"
            >
              Open epic
            </button>
          )}
        </>
      )}
    </div>
  );
}
