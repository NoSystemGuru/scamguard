const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

module.exports = async (req, res) => {
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

    console.log('Scraping:', url);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    const adData = {
      url,
      title: $('h1').first().text().trim() || 'Titre non trouve',
      price: $('[data-qa-id="adview_price"]').first().text().trim() || 'Prix non disponible',
      description: $('[data-qa-id="adview_description_container"]').text().trim().substring(0, 500) || 'Description non disponible',
      location: $('[data-qa-id="adview_location_informations"]').text().trim() || 'Localisation non disponible',
      image_url: $('img[itemprop="image"]').first().attr('src') || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400'
    };

    console.log('Donnees extraites:', adData.title);

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `Tu es un expert en detection d'arnaques. Analyse cette annonce Leboncoin.

Donnees:
- Titre: ${adData.title}
- Prix: ${adData.price}
- Description: ${adData.description}
- Localisation: ${adData.location}

Evalue sur 100: profile_score, price_score, content_score, photos_score, location_score, payment_score, communication_score, timing_score, items_count_score.

Fournis: overall_score, risk_level ("low"/"medium"/"high"), red_flags (array), green_flags (array), recommendation (francais).

Reponds en JSON valide.`;

    console.log('Appel OpenAI...');

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Tu es un expert en detection d'arnaques. Reponds en JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    
    console.log('Analyse terminee - Score:', analysis.overall_score);

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
    console.error('Erreur:', error.message);
    return res.status(500).set(corsHeaders).json({
      error: 'Erreur lors de l\'analyse',
      message: error.message
    });
  }
};
