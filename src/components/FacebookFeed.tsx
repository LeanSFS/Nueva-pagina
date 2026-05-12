import React, { useEffect } from 'react';

declare global {
  interface Window {
    FB: any;
  }
}

export default function FacebookFeed() {
  useEffect(() => {
    // Load SDK if not already loaded
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = "https://connect.facebook.net/es_LA/sdk.js#xfbml=1&version=v19.0";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    } else if (window.FB) {
      // If SDK already loaded, trigger re-parse
      window.FB.XFBML.parse();
    }
  }, []);

  return (
    <div className="w-full h-full min-h-[500px] flex flex-col items-center relative overflow-hidden bg-[#f0f2f5]">
      <div id="fb-root"></div>
      
      {/* Loading State Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Cargando Muro...</p>
        </div>
      </div>

      <div 
        className="fb-page relative z-10 w-full" 
        data-href="https://www.facebook.com/lys.lavados/" 
        data-tabs="timeline" 
        data-width="500" 
        data-height="500" 
        data-small-header="false" 
        data-adapt-container-width="true" 
        data-hide-cover="false" 
        data-show-facepile="true"
      >
        <blockquote cite="https://www.facebook.com/lys.lavados/" className="fb-xfbml-parse-ignore">
          <a href="https://www.facebook.com/lys.lavados/">L y S Lavados</a>
        </blockquote>
      </div>
    </div>
  );
}
