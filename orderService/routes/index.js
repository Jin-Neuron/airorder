const express = require('express');
const router = express.Router();

let ui = [];

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Airorder Oreder System' });
});

router.get('/', function(req, res, next) {
    const paras = req.body.add;
    paras.push(ui);
    res.redirect('/');
});


module.exports = router;
