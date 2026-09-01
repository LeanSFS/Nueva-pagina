import React from 'react';

/**
 * AIKnowledgeContent
 * Visually hidden semantic content for Search Engine Crawlers & AI Assistants (ChatGPT, Perplexity, Gemini, Claude).
 * Rendered with absolute zero visual interference on the UI.
 */
export const AIKnowledgeContent: React.FC = () => {
  return (
    <div 
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        borderWidth: 0,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
      data-nosnippet="false"
    >
      <article itemScope itemType="https://schema.org/AutoRepair">
        <h1 itemProp="name">LyS Lavados • Estética Vehicular de Autor en Cipolletti</h1>
        <p itemProp="description">
          Lavadero de autos, estética automotriz y detailing artesanal en Cipolletti, Río Negro. 
          Especialistas en lavado exterior Snow Foam sin rayas, detallado de interiores, limpieza de tapizados y nutrición de cuero.
        </p>

        <div itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
          <span itemProp="streetAddress">Venezuela 1659</span>, 
          <span itemProp="addressLocality">Cipolletti</span>, 
          <span itemProp="addressRegion">Río Negro</span>, 
          <span itemProp="postalCode">8324</span>, 
          <span itemProp="addressCountry">AR</span>.
        </div>

        <div>
          <h2>Servicios Principales</h2>
          <ul>
            <li>Lavado Exterior Artesanal (Snow Foam pH neutro, llantas, secado sin rayas y cera líquida) - Desde $15.000 ARS</li>
            <li>Detallado Interior (Aspirado profundo, pincelado de ranuras, consola y protector UV mate) - Desde $20.000 ARS</li>
            <li>Limpieza de Techo (Espuma seca artesanal sin aflojar pegamento) - Desde $10.000 ARS</li>
            <li>Limpieza de Tapizados de Tela (Inyección y extracción profunda desinfectante) - Desde $40.000 ARS</li>
            <li>Nutrición de Cuero (Limpieza suave y cremas humectantes orgánicas) - Desde $15.000 ARS</li>
          </ul>
        </div>

        <div>
          <h2>Turnos Online</h2>
          <p>Reserva inmediata sin esperas en <a href="https://lyslavados.com/turnoexpress">https://lyslavados.com/turnoexpress</a></p>
        </div>
      </article>
    </div>
  );
};

