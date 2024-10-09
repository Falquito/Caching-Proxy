import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import zlib from 'zlib';

const app = express();
const PORT = process.env.PORT ?? 3000;
const targetUrl = process.env.ORIGIN ?? "https://dummyjson.com";
const cache = [];

const cacheMiddleware = (req, res, next) => {
    const endpoint = req.originalUrl;
    console.log(cache);
    for (let i = 0; i < cache.length; i++) {
        if (cache[i].url === endpoint) {
            return res.setHeader("X-Cache","HIT").status(200).json(cache[i].data); // Devuelve el caché si existe
        }
    }
    
    next(); // Avanza al proxy middleware si no hay caché
};

// Configuro el middleware proxy
const proxyOptions = {
    target: targetUrl,
    changeOrigin: true,
    selfHandleResponse: true,
    followRedirects: false, // Desactiva la redirección automática
    on: {
        proxyRes: (proxyRes, req, res) => {
            let body = [];

            // Acumula los datos de la respuesta
            proxyRes.on('data', chunk => {
                body.push(chunk);
            });

            // Cuando se ha terminado de recibir la respuesta
            proxyRes.on('end', () => {
                body = Buffer.concat(body);
                const contentType = proxyRes.headers['content-type'];
                const contentEncoding = proxyRes.headers['content-encoding'];
                console.log('Content-Type:', contentType);
                console.log('Content-Encoding:', contentEncoding);
                // Manejo de contenido gzip ya que el servidor destinatario me manda los datos comprimidos
                zlib.gunzip(body, (err, dezipped) => {
                    if (err) {
                        console.error('Error al descomprimir:', err);
                        return res.status(500).send('Error al descomprimir la respuesta');
                    }
                    const jsonData = JSON.parse(dezipped.toString('utf-8')); // Convertir a string y luego a JSON
                    cache.push({ url: req.originalUrl, data: jsonData });
                    res.setHeader("X-Cache","MISS").status(proxyRes.statusCode).json(jsonData);
                });

            });
        },
        error: (err, req, res) => {
            console.log("error fuera de proxyres", err);
            res.status(500).send('Proxy error');
        }
    }
};

app.get('/products', cacheMiddleware, createProxyMiddleware(proxyOptions));

app.listen(PORT, () => {
    console.log(`Servidor proxy escuchando en http://localhost:${PORT}`);
});
