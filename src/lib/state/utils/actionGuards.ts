import { ActionType } from '../types';

export const isSessionAction = (action: ActionType): boolean => {
  return action.type.startsWith('session/');
};

export const isProjectAction = (action: ActionType): boolean => {
  return action.type.startsWith('project/');
};

export const isWorkspaceAction = (action: ActionType): boolean => {
  return action.type.startsWith('workspace/');
};

export const isUIAction = (action: ActionType): boolean => {
  return action.type.startsWith('ui/');
};
