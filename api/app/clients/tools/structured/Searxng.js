const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const axios = require('axios');
const cheerio = require('cheerio');

class Searxng extends Tool {
  static lc_name() {
    return 'SearxNGResults';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVarHost = 'SEARXNG_API_URL';
    this.override = fields.override ?? false;
    this.searxngHost = fields.searxngHost ?? getEnvironmentVariable(this.envVarHost);

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'searxng';
    this.description = 'SearxNG.';

    this.schema = z.object({
      query: z.string().min(1).describe('The search query string.'),
    });
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { query } = validationResult.data;

    const response = await fetch(
      `${this.searxngHost}/search?format=json&q=${encodeURIComponent(query)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const json = await response.json();
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${json.error.message}`);
    }

    const documents = await Promise.all(json.results.map(this.parseResponse));

    return JSON.stringify(documents);
  }

  async fetchWebsiteContent(url) {
    try {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      // Extract the main content from the website
      return $('body').html();
    } catch (error) {
      console.error(`Error fetching website content for ${url}:`, error);
      return null;
    }
  }

  async parseResponse(result) {
    let pageContent;
    console.info(`Fetching content for URL: ${result.url}`);

    try {
      // Try fetching the complete website content
      const fetchedContent = await this.fetchWebsiteContent(result.url);

      // Use the fetched content if available, otherwise fallback to result.content
      pageContent = fetchedContent || result.content;
    } catch (error) {
      console.error(`Error fetching content for URL: ${result.url}`, error);
      pageContent = result.content; // Fallback to result.content in case of an error
    }

    return {
      pageContent,
      metadata: {
        title: result.title,
        url: result.url,
        ...(result.img_src && { img_src: result.img_src }),
      },
    };
  }
}

module.exports = Searxng;
