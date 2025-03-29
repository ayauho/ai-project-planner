'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { authStorage } from '@/lib/client/auth/storage';
import { logger } from '@/lib/client/logger';
import { PreloadState } from '../preload-state';

// Dynamically import WorkspaceLayout to prevent SSR issues
const WorkspaceLayout = dynamic(() => import('@/components/workspace/layout'), { 
  ssr: false 
});

interface User {
  _id: string;
  nickname: string;
}

export default function WorkspacePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Ensure this runs only on client-side
    setIsClient(true);

    const checkAuth = async () => {
      try {
        const session = await authStorage.getSession();
        logger.info('Workspace auth check:', {
          hasSession: !!session,
          userId: session?.user?._id
        });
        
        if (!session?.user?._id) {
          logger.warn('No valid session found, redirecting to auth');
          router.push('/auth');
          return;
        }
        
        setUser(session.user);
        
        // Set up listener for user changes
        window.addEventListener('user-changed', (event: Event) => {
          const customEvent = event as CustomEvent;
          logger.info('User changed event detected in workspace', {
            previousUserId: customEvent.detail?.previousUserId,
            newUserId: customEvent.detail?.newUserId
          });
          
          // Force reload the page to ensure clean state for new user
          window.location.reload();
        });
        
        // Check if this user has any projects
        // If not, show the project creation interface
        try {
          // Import dynamically to avoid circular dependencies
          const { workspaceStateManager } = await import('@/lib/workspace/state/manager');
          
          // No need to wait for this to finish - initialize loading state
          setIsLoading(false);
          
          // Check if user has any projects
          const response = await fetch('/api/projects');
          if (response.ok) {
            const data = await response.json();
            const projects = Array.isArray(data) ? data : [];
            
            // If user has no projects, show project creation interface
            if (projects.length === 0) {
              logger.info('New user detected - no projects found, showing project creation interface');
              
              // Clear any previous selections and show project creation
              workspaceStateManager.clearSelection();
              
              // Add a flag to indicate this is a new user
              sessionStorage.setItem('__new_user_first_visit', 'true');
              
              // Also remove any existing workspace state for this user
              // to ensure a clean slate for the first project
              try {
                // Import workspace persistence manager
                const { workspacePersistenceManager } = await import('@/lib/workspace/persistence/manager');
                
                // Clean user state for new user
                if (session?.user?._id) {
                  await workspacePersistenceManager.clearState(session.user._id);
                  logger.info('Cleared existing workspace state for new user', {
                    userId: session.user._id
                  });
                } else {
                  await workspacePersistenceManager.clearState();
                  logger.info('Cleared global workspace state for unknown user');
                }
              } catch (clearError) {
                logger.error('Error clearing workspace state for new user', {
                  error: String(clearError)
                });
              }
            }
          } else {
            // Error fetching projects - still show project creation interface
            logger.warn('Error fetching projects, showing project creation interface', {
              status: response.status,
              statusText: response.statusText
            });
            workspaceStateManager.clearSelection();
          }
        } catch (projectError) {
          logger.error('Error checking user projects', { error: String(projectError) });
          // Show project creation interface as fallback
          const { workspaceStateManager } = await import('@/lib/workspace/state/manager');
          workspaceStateManager.clearSelection();
        }
      } catch (error) {
        logger.error('Workspace auth check failed:', { error: String(error) });
        router.push('/auth');
      }
    };
    
    checkAuth();
  }, [router]);

  const handleSignOut = () => {
    authStorage.clearSession();
    router.push('/auth');
  };

  // Render loading state during initial load or server-side rendering
  if (!isClient || isLoading) {
    return (<main className="flex min-h-screen flex-col items-center justify-center p-24"><div className="text-xl">Loading workspace...</div></main>);
  }

  return (<><PreloadState /><WorkspaceLayout user={user} onSignOut={handleSignOut} /></>);
}
