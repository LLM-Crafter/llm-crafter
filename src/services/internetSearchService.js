const https = require('https');
const { URL } = require('url');

/**
 * Internet Search Service
 * Provides abstraction layer for different search providers
 */
class InternetSearchService {
  constructor() {
    this.providers = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize available search providers
   */
  initializeProviders() {
    this.providers.set('brave', new BraveSearchProvider());
    this.providers.set('tavily', new TavilySearchProvider());
  }

  /**
   * Execute search using specified provider
   */
  async search(query, options = {}) {
    const {
      provider = 'brave',
      max_results = 5,
      api_key,
      ...providerOptions
    } = options;

    if (!api_key) {
      throw new Error(`API key is required for ${provider} search`);
    }

    const searchProvider = this.providers.get(provider);
    if (!searchProvider) {
      throw new Error(`Unsupported search provider: ${provider}`);
    }

    return await searchProvider.search(query, {
      max_results,
      api_key,
      ...providerOptions
    });
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }
}

/**
 * Base class for search providers
 */
class BaseSearchProvider {
  async search(query, options) {
    throw new Error('Search method must be implemented by provider');
  }

  /**
   * Make HTTPS request
   */
  async makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'LLM-Crafter/1.0',
          ...options.headers
        }
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              status: res.statusCode,
              data: parsed
            });
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }
}

/**
 * Brave Search API Provider
 */
class BraveSearchProvider extends BaseSearchProvider {
  async search(query, options) {
    const { max_results = 5, api_key } = options;
    const startTime = Date.now();

    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.append('q', query);
      url.searchParams.append('count', Math.min(max_results, 20).toString());
      url.searchParams.append('safesearch', 'moderate');

      const response = await this.makeRequest(url.toString(), {
        headers: {
          'X-Subscription-Token': api_key,
          'Accept': 'application/json'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Brave Search API returned status ${response.status}`);
      }

      const results = response.data.web?.results || [];
      
      return {
        query,
        provider: 'brave',
        results: results.slice(0, max_results).map(result => ({
          title: result.title,
          url: result.url,
          snippet: result.description || ''
        })),
        total_results: results.length,
        search_time_ms: Date.now() - startTime
      };
    } catch (error) {
      throw new Error(`Brave Search failed: ${error.message}`);
    }
  }
}

/**
 * Tavily Search API Provider
 */
class TavilySearchProvider extends BaseSearchProvider {
  async search(query, options) {
    const { max_results = 5, api_key } = options;
    const startTime = Date.now();

    try {
      const response = await this.makeRequest('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          api_key,
          query,
          search_depth: 'basic',
          include_answer: false,
          include_images: false,
          include_raw_content: false,
          max_results: Math.min(max_results, 20)
        }
      });

      if (response.status !== 200) {
        throw new Error(`Tavily Search API returned status ${response.status}`);
      }

      const results = response.data.results || [];
      
      return {
        query,
        provider: 'tavily',
        results: results.slice(0, max_results).map(result => ({
          title: result.title,
          url: result.url,
          snippet: result.content || ''
        })),
        total_results: results.length,
        search_time_ms: Date.now() - startTime
      };
    } catch (error) {
      throw new Error(`Tavily Search failed: ${error.message}`);
    }
  }
}

module.exports = InternetSearchService;