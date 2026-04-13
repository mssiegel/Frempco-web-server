import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import 'dotenv/config';

import { createServer } from 'http';

import corsOptions from './services/corsOptions.js';
import socketIOSetup from './services/socketIOSetup.js';
import activityRoutes from './routes/activities.js';

const app = express();

app.use(express.json());
app.use(helmet());
app.use(cors(corsOptions));
const server = createServer(app);

socketIOSetup(server);

const port = process.env.PORT || 4000;

app.use('/api/v1/activities', activityRoutes);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

server.listen(port, () => {
  console.log(`Listening to requests on port ${port}`);
});
