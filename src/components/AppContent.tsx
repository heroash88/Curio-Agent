import React from 'react';
import { isHaSmartHomeReviewMode } from '../services/haSmartHomeMock';
import CurioAgentMode from './curio/CurioAgentMode';
import ErrorBoundary from './ErrorBoundary';

const HaSmartHomeReview = React.lazy(() => import('./curio/dashboard/HaSmartHomeReview'));

const AppContent: React.FC = () => {
  const reviewMode = isHaSmartHomeReviewMode();

  return (
    <main className="curio-app-root h-full w-full overflow-hidden bg-slate-900">
      <ErrorBoundary>
        {reviewMode ? (
          <React.Suspense fallback={null}>
            <HaSmartHomeReview />
          </React.Suspense>
        ) : (
          <CurioAgentMode />
        )}
      </ErrorBoundary>
    </main>
  );
};

export default AppContent;
