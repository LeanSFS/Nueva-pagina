import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Star, ChevronLeft, ChevronRight, ExternalLink, MessageSquarePlus, CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react';
import { safeFetchApi, isStaticHost } from '../services/firestoreService.ts';

export interface GoogleReview {
  id: string;
  authorName: string;
  authorPhoto: string | null;
  authorInitial: string;
  role: string;
  rating: number;
  relativeTime: string;
  text: string;
  highlight?: string;
  service?: string;
  verified: boolean;
}

export interface GoogleReviewsData {
  placeName: string;
  address: string;
  rating: number;
  userRatingCount: number;
  googleMapsUri: string;
  writeReviewUri: string;
  lastSynced?: string;
  reviews: GoogleReview[];
}

const DEFAULT_REVIEWS_DATA: GoogleReviewsData = {
  placeName: "LyS Lavados",
  address: "Venezuela 1659, Cipolletti, Río Negro",
  rating: 5.0,
  userRatingCount: 23,
  googleMapsUri: "https://maps.google.com/?cid=15795327040143553133&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA",
  writeReviewUri: "https://www.google.com/maps/place//data=!4m3!3m2!1s0x960a31ac015332cd:0xdb3446417ae0f26d!12e1?g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA",
  reviews: [
    {
      id: "places/adriana-beverina",
      authorName: "adriana beverina",
      authorPhoto: "https://lh3.googleusercontent.com/a-/ALV-UjV4iC7G8SSJVe8oVvanfmCUjUFU6nQHSbaCSQ3k2J0xCBPKwXnZ=s128-c0x00000000-cc-rp-mo-ba2",
      authorInitial: "AB",
      role: "Google Reviewer",
      rating: 5,
      relativeTime: "Hace 2 meses",
      text: "5 estrellas sin ninguna duda... Leandro excelente atención y deja impecable el auto... Mejor que en lugares habilitados cómo tal.... Súper recomendable!!!",
      highlight: "Leandro excelente atención y deja impecable el auto",
      service: "Servicio Verificado",
      verified: true
    },
    {
      id: "places/maria-elena-garcia",
      authorName: "María elena Garcia",
      authorPhoto: "https://lh3.googleusercontent.com/a/ACg8ocKORJQgojRCLIlqOHkjjy28KJDVg4CL_2AWjT7iJeOmuIYz7Q=s128-c0x00000000-cc-rp-mo",
      authorInitial: "MG",
      role: "Google Reviewer",
      rating: 5,
      relativeTime: "Hace 3 meses",
      text: "Lo verdad que lo súper recomiendo mi auto es modelo viejito y cada vez que lo llevo viene hermoso. Muy responsable con su trabajo. En una oportunidad lleve mi auto y estaba pronosticado lluvia y me avisó que lo mejor sería que solo lo limpiará adentro obviamente que el precio fue más económico, xq con la lluvia seria en vano el lavado, eso para mí marco la diferencia cuido mi bolsillo y fue sincero, dudo que otro lo haga. Por eso mis 5 estrellas.",
      highlight: "Muy responsable con su trabajo",
      service: "Servicio Verificado",
      verified: true
    },
    {
      id: "places/romina-riquelme",
      authorName: "Romina Riquelme",
      authorPhoto: "https://lh3.googleusercontent.com/a/ACg8ocIRkFeYpNN7havFJjqmlnkxj3v7VXpgR09DLg6a0DYDoPOlQw=s128-c0x00000000-cc-rp-mo",
      authorInitial: "RR",
      role: "Local Guide",
      rating: 5,
      relativeTime: "Hace 5 meses",
      text: "Excelente trabajo, muy detallista y responsable. El auto estaba en muy malas condiciones y quedó como nuevo! Se notó la dedicación y compromiso con lo que hace. Muchas gracias por solucionarnos una tarea ✨️",
      highlight: "quedó como nuevo!",
      service: "Pack Full",
      verified: true
    },
    {
      id: "places/mariela-retamal",
      authorName: "Mariela Retamal",
      authorPhoto: "https://lh3.googleusercontent.com/a/ACg8ocLWWiW_xIRAasRdr6qMODItQ5wPDcHMLFgiuxuReNRDCahA_g=s128-c0x00000000-cc-rp-mo",
      authorInitial: "MR",
      role: "Local Guide",
      rating: 5,
      relativeTime: "Hace 5 meses",
      text: "Impecable labor!! Lo súper recomiendo. Excelentes productos, te cuidan el auto, al lavadero al cual lo llevaba antes calle Naciones Unidas frente al cementerio un desastre siempre algo me rompían del auto y los productos que utilizaban un desastre de muy mala calidad.",
      highlight: "Impecable labor!! Lo súper recomiendo",
      service: "Servicio Verificado",
      verified: true
    },
    {
      id: "places/monica-cifuentes",
      authorName: "Monica Cifuentes",
      authorPhoto: "https://lh3.googleusercontent.com/a/ACg8ocKB-FFGDe60-r5fUQmjOLSQazy4Jg4iNFH2JFokD2ROZ9ZGnw=s128-c0x00000000-cc-rp-mo",
      authorInitial: "MC",
      role: "Cliente Verificado",
      rating: 5,
      relativeTime: "Hace 5 meses",
      text: "Excelente trabajo!!! Prolijo, responsable LyS lLavados... Re lindo quedó mí auto... Es por ahí!!! Éxitos... 👍🏼👏🏼🤩",
      highlight: "Re lindo quedó mí auto",
      service: "Servicio Verificado",
      verified: true
    },
    {
      id: "rev-1",
      authorName: "Maria Rosa SANSEVERINO",
      authorPhoto: null,
      authorInitial: "MS",
      role: "Cliente Verificado",
      rating: 5,
      relativeTime: "Hace unos meses",
      text: "Siempre excelente servicio y atención. Soy cliente habitual. Le llevo el auto en pésimas condiciones por el polvo y lo deja como salido de la concesionaria. Muy recomendable.",
      highlight: "lo deja como salido de la concesionaria",
      service: "Detallado Interior + Exterior",
      verified: true
    },
    {
      id: "rev-3",
      authorName: "Miguel Montenegro",
      authorPhoto: null,
      authorInitial: "MM",
      role: "Cliente Verificado",
      rating: 5,
      relativeTime: "Hace unos meses",
      text: "Excelente atención. Cordialidad, seriedad y compromiso. Super recomendable para quien cuida su vehículo.",
      highlight: "Cordialidad, seriedad y compromiso",
      service: "Detallado Interior",
      verified: true
    },
    {
      id: "rev-6",
      authorName: "Gabriela Figueroa",
      authorPhoto: null,
      authorInitial: "GF",
      role: "Local Guide",
      rating: 5,
      relativeTime: "Hace unos meses",
      text: "Excelente servicio, los autos quedaron impecables, muy buen trabajo Leandro. Muchas gracias por la dedicación y cuidado de cada plástico.",
      highlight: "los autos quedaron impecables",
      service: "Pack Full",
      verified: true
    }
  ]
};

export const GoogleReviewsCarousel: React.FC = () => {
  const [data, setData] = useState<GoogleReviewsData>(DEFAULT_REVIEWS_DATA);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'guides'>('all');
  const touchStartX = useRef<number | null>(null);

  // Fetch live reviews from /api/reviews
  useEffect(() => {
    let isMounted = true;
    const fetchReviews = async () => {
      try {
        if (!isStaticHost()) {
          const res = await safeFetchApi('/api/reviews', undefined, 4500);
          if (res && res.ok) {
            const json: GoogleReviewsData = await res.json();
            if (json && Array.isArray(json.reviews) && json.reviews.length > 0) {
              if (isMounted) setData(json);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Silent note fetching google reviews from server, using local data:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchReviews();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter reviews
  const filteredReviews = useMemo(() => {
    const list = data.reviews || DEFAULT_REVIEWS_DATA.reviews;
    if (activeFilter === 'guides') {
      return list.filter(r => (r.role || '').toLowerCase().includes('guide'));
    }
    return list;
  }, [data.reviews, activeFilter]);

  // Adjust current index if it exceeds filtered length
  useEffect(() => {
    setCurrentIndex(0);
  }, [activeFilter]);

  const maxIndex = Math.max(0, filteredReviews.length - 1);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? maxIndex : prev - 1));
  }, [maxIndex]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
  }, [maxIndex]);

  // Autoplay timer: changes slide every 5.5 seconds, pauses when hovered or touched
  useEffect(() => {
    if (isPaused || maxIndex <= 0) return;
    const timer = setInterval(() => {
      handleNext();
    }, 5500);
    return () => clearInterval(timer);
  }, [isPaused, maxIndex, handleNext]);

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - touchStartX.current;
    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartX.current = null;
    setTimeout(() => setIsPaused(false), 2000);
  };

  return (
    <section className="mt-20 pb-20 relative">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-96 bg-emerald-500/[0.03] blur-3xl rounded-full pointer-events-none" />

      {/* Header section with kicker */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-emerald-400/90">
              Prueba Social Verificada
            </span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight">
            Opiniones en <span className="text-emerald-400">Google Maps</span>
          </h2>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1.5 max-w-xl">
            Reseñas 100% reales de conductores que confían el cuidado estético y detallado de su vehículo en nuestro taller en Cipolletti.
          </p>
        </div>

        {/* Global Google Badge */}
        <div className="flex items-center gap-4 bg-zinc-900/90 border border-white/10 rounded-2xl px-5 py-3.5 shadow-xl shrink-0 backdrop-blur-md">
          <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.27 21.41 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.59 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-display font-black text-white">{data.rating.toFixed(1)}</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </div>
            <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
              <span>{data.userRatingCount}+ opiniones reales</span>
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-bold">100% de 5★</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Navigation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 p-1 bg-zinc-900/80 border border-white/5 rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-emerald-500 text-night shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Todas ({data.reviews.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('guides')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'guides'
                ? 'bg-emerald-500 text-night shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            ⭐ Google Local Guides
          </button>
        </div>

        {/* Next / Prev Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Reseña anterior"
            className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 hover:border-emerald-500/50 hover:bg-zinc-800 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Siguiente reseña"
            className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 hover:border-emerald-500/50 hover:bg-zinc-800 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Carousel Container */}
      <div
        className="relative overflow-hidden rounded-3xl"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slides Track */}
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {filteredReviews.map((review, idx) => (
            <div key={review.id || idx} className="w-full shrink-0 px-1">
              <div className="bg-zinc-900/90 border border-white/10 hover:border-emerald-500/30 rounded-3xl p-6 sm:p-8 md:p-10 shadow-2xl transition-all duration-300 relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full pointer-events-none" />

                {/* Top Row: User Avatar + Name + Google Verified Pill */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3.5">
                    {review.authorPhoto ? (
                      <img
                        src={review.authorPhoto}
                        alt={review.authorName}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-full border-2 border-emerald-500/40 object-cover shrink-0 shadow-md"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500/20 to-zinc-800 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 font-display font-black text-sm shrink-0 shadow-md">
                        {review.authorInitial}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-display font-bold text-white text-base sm:text-lg tracking-tight">
                          {review.authorName}
                        </h4>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          {review.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                        <span className="text-[11px] font-medium text-zinc-500">
                          {review.relativeTime}
                        </span>
                        {review.service && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-zinc-600" />
                            <span className="text-[11px] font-semibold text-zinc-400 hidden sm:inline">
                              {review.service}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Google Authenticity Tag */}
                  <div className="flex items-center gap-2 self-start sm:self-center px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/5">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.27 21.41 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.59 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span className="text-[11px] font-bold text-zinc-300 tracking-wide">
                      Google Review
                    </span>
                  </div>
                </div>

                {/* Main Quote Text */}
                <div className="relative mb-6">
                  <span className="font-serif text-5xl sm:text-6xl text-emerald-500/20 absolute -top-4 -left-2 select-none pointer-events-none">
                    “
                  </span>
                  <p className="text-zinc-200 text-base sm:text-lg leading-relaxed relative z-10 pl-4 sm:pl-6 italic font-display">
                    {review.highlight && review.text.includes(review.highlight) ? (
                      <>
                        {review.text.split(review.highlight)[0]}
                        <span className="text-emerald-300 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 not-italic">
                          {review.highlight}
                        </span>
                        {review.text.split(review.highlight)[1]}
                      </>
                    ) : (
                      review.text
                    )}
                  </p>
                </div>

                {/* Card Footer: Location info & direct Google link */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 border-t border-white/5 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Experiencia auténtica en <strong className="text-white">Venezuela 1659, Cipolletti</strong></span>
                  </div>

                  <a
                    href={data.googleMapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-bold text-xs uppercase tracking-wider transition-colors"
                  >
                    Ver reseña original en Google
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination Indicators & Quick Action CTAs */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Dots */}
        <div className="flex items-center gap-2">
          {filteredReviews.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Ir a la reseña ${i + 1}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                i === currentIndex
                  ? 'w-8 bg-emerald-400 shadow-md shadow-emerald-400/30'
                  : 'w-2 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
          <span className="text-[11px] font-bold text-zinc-500 ml-2">
            {currentIndex + 1} de {filteredReviews.length}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <a
            href={data.writeReviewUri}
            target="_blank"
            rel="noreferrer"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-night font-display font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Dejar una Reseña
          </a>

          <a
            href={data.googleMapsUri}
            target="_blank"
            rel="noreferrer"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white font-display font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
          >
            Ver en Google Maps
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default GoogleReviewsCarousel;
