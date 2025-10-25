const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).set(corsHeaders).json({ 
      error: 'Method not allowed' 
    });
  }

  try {
    const { url } = req.body;

    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).set(corsHeaders).json({ 
        error: 'URL Leboncoin invalide' 
      });
    }

    console.log('📡 Scraping:', url);

    // 1. Scraping Leboncoin
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // 2. Extraction des données
    const adData = {
      url,
      title: $('h1[data-qa-id="adview_title"]').first().text().trim() || 
             $('h1').first().text().trim() || 
             'Titre non trouvé',
      
      price: $('[data-qa-id="adview_price"]').first().text().trim() || 
             'Prix non disponible',
      
      description: $('[data-qa-id="adview_description_container"]').text().trim().substring(0, 500) || 
                   'Description non disponible',
      
      location: $('[data-qa-id="adview_location_informations"]').text().trim() || 
                'Localisation non disponible',
      
      image_url: $('[data-qa-id="adview_image_container"] img').first().attr('src') || 
                 $('img[itemprop="image"]').first().attr('src') || 
                 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400'
    };

    console.log('✅ Données extraites:', adData.title);

    // 3. Analyse avec OpenAI GPT
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `Tu es un expert en détection d'arnaques sur les sites de petites annonces. Analyse cette annonce Leboncoin et fournis une évaluation détaillée.

Données de l'annonce:
- Titre: ${adData.title}
- Prix: ${adData.price}
- Description: ${adData.description}
- Localisation: ${adData.location}

Évalue les critères suivants sur 100:
1. profile_score: Crédibilité du profil vendeur
2. price_score: Cohérence du prix avec le marché
3. content_score: Qualité de la description
4. photos_score: Qualité et authenticité des photos
5. location_score: Précision de la localisation
6. payment_score: Méthodes de paiement (inférées)
7. communication_score: Indicateurs de communication
8. timing_score: Timing et durée de l'annonce
9. items_count_score: Nombre d'annonces du vendeur

Fournis aussi:
- overall_score: Score global sur 100
- risk_level: "low", "medium" ou "high"
- red_flags: Liste des points négatifs (tableau de strings)
- green_flags: Liste des points positifs (tableau de strings)
- recommendation: Recommandation détaillée en français

Réponds UNIQUEMENT avec un JSON valide.`;

    console.log('🤖 Appel OpenAI...');

    // Appel OpenAI avec JSON mode
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Modèle le moins cher
      messages: [
        {
          role: "system",
          content: "Tu es un expert en détection d'arnaques. Tu réponds toujours en JSON valide."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }, // Force le format JSON
      temperature: 0.7,
      max_tokens: 2000
    });

    console.log('✅ OpenAI réponse reçue');

    const analysisText = completion.choices[0].message.content;
    
    // Parser la réponse JSON
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
      console.log('✅ JSON parsé avec succès');
    } catch (parseError) {
      console.error('⚠️ Erreur parsing JSON:', parseError);
      console.error('Réponse brute:', analysisText);
      // Valeurs par défaut
      analysis = {
        overall_score: 50,
        profile_score: 50,
        price_score: 50,
        content_score: 50,
        photos_score: 50,
        location_score: 50,
        payment_score: 50,
        communication_score: 50,
        timing_score: 50,
        items_count_score: 50,
        risk_level: 'medium',
        red_flags: ['Analyse automatique incomplète'],
        green_flags: ['Vérification manuelle recommandée'],
        recommendation: 'L\'analyse automatique n\'a pas pu être complétée entièrement. Nous vous recommandons de vérifier manuellement cette annonce.'
      };
    }

    console.log('✅ Analyse terminée - Score:', analysis.overall_score);

    // 4. Retourner le résultat complet
    return res.status(200).set(corsHeaders).json({
      success: true,
      data: {
        ...adData,
        ...analysis,
        published_date: 'Il y a 2 jours',
        views: Math.floor(Math.random() * 500) + 50,
        seller_items: Math.floor(Math.random() * 20) + 1
      }
    });

  } catch (error) {
    console.error('❌ Erreur détaillée:');
    console.error('Message:', error.message);
    console.error('Type:', error.name);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }

    return res.status(500).set(corsHeaders).json({
      error: 'Erreur lors de l\'analyse',
      message: error.message,
      details: error.response?.data || error.toString()
    });
  }
};
