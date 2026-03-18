const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    // Initialize Gemini AI if API key is available
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = this.genAI.getGenerativeModel({ 
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' 
      });
    }
  }

  // Analyze text with Gemini
  async analyzeWithGemini(text, analysisType = 'summary') {
    try {
      if (!this.geminiModel) {
        throw new Error('Gemini AI not configured');
      }

      let prompt;
      
      switch (analysisType) {
        case 'sentiment':
          prompt = `Analyze the sentiment of this text: "${text}"`;
          break;
        case 'summary':
          prompt = `Provide a concise summary of this text: "${text}"`;
          break;
        default:
          prompt = `Analyze this text: "${text}"`;
      }

      const result = await this.geminiModel.generateContent(prompt);
      const response = await result.response;
      
      return {
        analysis: response.text(),
        type: analysisType,
        service: 'gemini'
      };

    } catch (error) {
      logger.error('Gemini analysis error:', error);
      throw error;
    }
  }

  // Get AI service status
  getServiceStatus() {
    return {
      gemini: {
        available: !!this.geminiModel,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
      }
    };
  }
}

module.exports = new AIService();
