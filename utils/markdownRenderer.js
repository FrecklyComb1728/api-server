const fs = require('fs');
const path = require('path');
const configPath = path.join(process.cwd(), 'server-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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
    const result = template
      .replace('${projectName}', config.projectName)
      .replace('${title}', title)
      .replace('${htmlContent}', htmlContent);

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
