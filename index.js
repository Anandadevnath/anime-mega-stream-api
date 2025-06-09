import express from 'express';
import { Anitaku } from './anime.js';

const app = express();

app.get('/', (req, res) => {
    res.send('hello world');
});

Anitaku();

app.listen(5000, () => {
    console.log('Server running at http://localhost:5000');
});