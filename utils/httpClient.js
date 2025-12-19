const axios = require('axios');

class HttpClient {
  constructor(config = {}) {
    this.axios = axios.create({
      timeout: config.timeout || 10000,
      headers: config.headers || {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
        'Accept': 'application/json'
      }
    });

    this.axios.interceptors.response.use(
      response => response,
      error => {
        return Promise.reject(this.handleError(error));
      }
    );
  }

  handleError(error) {
    if (error.response) {
      const err = new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      err.statusCode = error.response.status;
      err.data = error.response.data;
      return err;
    } else if (error.request) {
      const err = new Error('未收到来自服务器的响应');
      err.code = 'ECONNREFUSED';
      return err;
    } else if (error.code === 'ECONNABORTED') {
      const err = new Error('请求超时');
      err.code = 'TIMEOUT';
      return err;
    } else {
      return error;
    }
  }

  async get(url, params = {}, config = {}) {
    try {
      const response = await this.axios.get(url, {
        params,
        ...config
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async post(url, data = {}, config = {}) {
    try {
      const response = await this.axios.post(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = HttpClient;
