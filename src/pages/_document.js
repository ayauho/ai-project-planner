import { Html, Head, Main, NextScript } from 'next/document';

export default function MyDocument() {
  return (
    <Html lang="en">
      <Head>
        <script 
          id="workspace-transform-script"
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    const STORAGE_KEY = 'ai-project-planner-workspace-state';
    const savedData = localStorage.getItem(STORAGE_KEY);
    
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      if (parsedData && parsedData.viewport) {
        const viewport = parsedData.viewport;
        
        const style = document.createElement('style');
        style.setAttribute('id', 'pre-transform-style');
        style.setAttribute('data-priority', 'highest');
        style.innerHTML = \`
          svg, .svg-container svg {
            opacity: 0 !important;
          }
          
          :root {
            --saved-transform-x: \${viewport.translate.x}px;
            --saved-transform-y: \${viewport.translate.y}px;
            --saved-transform-scale: \${viewport.scale};
          }
          
          .transform-group, svg g.transform-group {
            transform: translate(\${viewport.translate.x}px, \${viewport.translate.y}px) scale(\${viewport.scale}) !important;
          }
        \`;
        
        document.head.appendChild(style);
        
        window.__savedTransform = {
          translate: viewport.translate,
          scale: viewport.scale,
          timestamp: Date.now()
        };
        
        console.log('[Init Script] Pre-applied saved transform:', window.__savedTransform);
      }
    }
  } catch (error) {
    console.error('[Init Script] Error pre-applying transform:', error);
  }
})();
            `
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}