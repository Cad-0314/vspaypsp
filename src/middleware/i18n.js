const fs = require('fs');
const path = require('path');

const locales = {
    en: JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/en.json'), 'utf8')),
    zh: JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/zh.json'), 'utf8'))
};

module.exports = function (req, res, next) {
    // Check for lang query param and set session
    if (req.query.lang && locales[req.query.lang]) {
        req.session.lang = req.query.lang;
    }

    // Default to 'en' if no session lang
    const currentLang = req.session.lang || 'en';
    const translations = locales[currentLang];

    // Make 't' function and currentLang available in views
    res.locals.currentLang = currentLang;
    res.locals.t = (key, params = {}) => {
        let text = translations[key] || key;
        for (const prop in params) {
            text = text.replace(`{${prop}}`, params[prop]);
        }
        return text;
    };

    next();
};
