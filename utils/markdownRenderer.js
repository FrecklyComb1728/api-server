const fs = require('fs');
const path = require('path');
const config = require('./configLoader');
const { marked } = require('marked');
const { sendError } = require('./errorHandler');


class MarkdownRenderer {

  constructor(templatePath) {
    this.templatePath = templatePath;
    this.template = null;
  }

  loadTemplate() {
    if (!this.template) {
      this.template = fs.readFileSync(this.templatePath, 'utf-8');
    }
    return this.template;
  }

  render(markdownContent, fileName = '') {
    const htmlContent = marked.parse(markdownContent);
    const template = this.loadTemplate();
    const title = fileName;
    const year = new Date().getFullYear();
    const result = template
      .replace(/\$\{projectName\}/g, config.projectName)
      .replace(/\$\{title\}/g, title)
      .replace(/\$\{htmlContent\}/g, htmlContent)
      .replace(/\$\{year\}/g, year);

    return result;
  }
}

function serveMarkdown(res, filePath, renderer) {
  if (!fs.existsSync(filePath)) {
    return sendError(res, 404);
  }

  try {
    const markdownContent = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const html = renderer.render(markdownContent, fileName);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).send('渲染 markdown 文件时出错');
  }
}

function serveRawMarkdown(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return sendError(res, 404);
  }

  try {
    const markdownContent = fs.readFileSync(filePath, 'utf-8');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(markdownContent);
  } catch (error) {
    res.status(500).send('读取 markdown 文件时出错');
  }
}

module.exports = {
  MarkdownRenderer,
  serveMarkdown,
  serveRawMarkdown
};
