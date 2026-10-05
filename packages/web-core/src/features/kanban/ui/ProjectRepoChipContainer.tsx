import { useEffect, useState } from 'react';
import { GitBranchIcon } from '@phosphor-icons/react';
import type { Repo } from 'shared/types';
import { repoApi } from '@/shared/lib/api';
import { getProjectRepoDefaults } from '@/shared/hooks/useProjectRepoDefaults';

interface ProjectRepoChipContainerProps {
  projectId: string;
  /** Opens the project settings, where the default repository is chosen. */
  onClick?: () => void;
}

interface LinkedRepo {
  name: string;
  branch: string;
}

/**
 * Shows which repository this board works on. The repository is attached to the
 * board (project) once, so individual tickets never need to repeat it.
 */
export function ProjectRepoChipContainer({
  projectId,
  onClick,
}: ProjectRepoChipContainerProps) {
  const [linked, setLinked] = useState<LinkedRepo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLinked(null);
    Promise.all([
      getProjectRepoDefaults(projectId),
      repoApi.list().catch(() => [] as Repo[]),
    ])
      .then(([defaults, repos]) => {
        if (cancelled) return;
        const byId = new Map(repos.map((repo) => [repo.id, repo]));
        setLinked(
          (defaults ?? []).flatMap((entry) => {
            const repo = byId.get(entry.repo_id);
            return repo
              ? [
                  {
                    name: repo.display_name || repo.name,
                    branch: entry.target_branch,
                  },
                ]
              : [];
          })
        );
      })
      .catch(() => {
        if (!cancelled) setLinked([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (linked === null) return null;

  const hasRepo = linked.length > 0;
  const label = hasRepo
    ? linked.map((repo) => `${repo.name} (${repo.branch})`).join(', ')
    : 'No repository linked';

  return (
    <button
      type="button"
      onClick={onClick}
      title={
        hasRepo
          ? 'Repository this board works on'
          : 'Link a repository in the project settings'
      }
      className="flex items-center gap-half rounded-sm border px-base py-half text-sm text-low hover:bg-secondary hover:text-normal"
    >
      <GitBranchIcon className="size-icon-xs" weight="bold" />
      <span className="truncate">{label}</span>
    </button>
  );
}
