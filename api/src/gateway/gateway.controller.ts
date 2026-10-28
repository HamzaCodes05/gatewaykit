import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiKey } from '../entities';
import { ApiKeyGuard } from './api-key.guard';
import { ChatDto } from './gateway.dto';
import { GatewayService } from './gateway.service';

type KeyedRequest = Request & { apiKey: ApiKey };

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class GatewayController {
  constructor(private readonly gw: GatewayService) {}

  @Get('models')
  models() {
    return { data: this.gw.models() };
  }

  @Post('chat')
  async chat(@Req() req: KeyedRequest, @Body() dto: ChatDto, @Res() res: Response) {
    this.gw.spec(dto.model); // validate before any bytes are sent

    if (!dto.stream) {
      res.json(await this.gw.complete(req.apiKey, dto));
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    try {
      for await (const ev of this.gw.stream(req.apiKey, dto, abort.signal)) {
        res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'stream failed';
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
