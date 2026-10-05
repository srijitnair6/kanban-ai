'use client';

import { cn } from '../lib/cn';
import { ButtonGroup, ButtonGroupItem } from './IconButtonGroup';

export type EntityViewMode = 'epics' | 'stories';

export interface EntityViewToggleProps {
  activeView: EntityViewMode;
  onViewChange: (view: EntityViewMode) => void;
  epicsLabel?: string;
  storiesLabel?: string;
  className?: string;
}

/** Switches the board between the epic view and the story view. */
export function EntityViewToggle({
  activeView,
  onViewChange,
  epicsLabel = 'Epic view',
  storiesLabel = 'Story view',
  className,
}: EntityViewToggleProps) {
  return (
    <ButtonGroup className={cn('flex-wrap', className)}>
      <ButtonGroupItem
        active={activeView === 'epics'}
        onClick={() => onViewChange('epics')}
      >
        {epicsLabel}
      </ButtonGroupItem>
      <ButtonGroupItem
        active={activeView === 'stories'}
        onClick={() => onViewChange('stories')}
      >
        {storiesLabel}
      </ButtonGroupItem>
    </ButtonGroup>
  );
}
