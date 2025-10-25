const axios = require('axios');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

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
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    const adData = {
      url,
      title: $('h1').first().text().trim() || 'Titre non trouve',
      price: $('[data-qa-id="adview_price"]').first().text().trim() || 'Prix non disponible',
      description: $('[data-qa-id="adview_description_container"]').text().trim().substring(0, 500) || 'Description',
      location: $('[data-qa-id="adview_location_informations"]').text().trim() || 'Localisation',
      image_url: $('img[itemprop="image"]').first().attr('src') || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400'
    };

    console.log('Donnees extraites:', adData.title);

    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });

    const prompt = `Analyse cette annonce Leboncoin. Titre: ${adData.title}, Prix: ${adData.price}, Description: ${adData.description}. Fournis un JSON avec: overall_score, profile_score, price_score, content_score, photos_score, location_score, payment_score, communication_score, timing_score, items_count_score (sur 100), risk_level (low/medium/high), red_flags (array), green_flags (array), recommendation (francais). Reponds UNIQUEMENT en JSON valide.`;

    console.log('Appel Claude...');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const analysisText = message.content[0].text;
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      overall_score: 50,
      profile_score: 50,
      price_score: 50,
      content_score: 50,
      photos_score: 50,
      location_score: 50,
      payment_score: 50,
      communication_score
