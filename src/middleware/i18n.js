const fs = require('fs');
const path = require('path');

const locales = {
    en: JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/en.json'), 'utf8')),
    zh: JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/zh.json'), 'utf8'))
};

module.exports = function (req, res, next) {
    // 1. Check for lang in query param (highest priority, sets cookie)
    if (req.query.lang && locales[req.query.lang]) {
        req.session.lang = req.query.lang;
        res.cookie('lang', req.query.lang, { maxAge: 90 * 24 * 60 * 60 * 1000, httpOnly: true }); // 90 days
    }
    // 2. Check for lang in cookies
    else if (req.cookies && req.cookies.lang && locales[req.cookies.lang]) {
        req.session.lang = req.cookies.lang;
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
