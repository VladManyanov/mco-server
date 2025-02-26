// mco-server is a game server, written from scratch, for an old game
// Copyright (C) <2017-2018>  <Joseph W Becher>

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import * as net from "net";
import { Connection } from "../../Connection";
import ConnectionMgr from "./connectionMgr";
import { IRawPacket } from "../shared/interfaces/IRawPacket";
import { IServerConfiguration } from "../shared/interfaces/IServerConfiguration";
import { ILoggers } from "../shared/logger";
import { sendPacketOkLogin } from "../../TCPManager";

export class ListenerThread {
  public loggers: ILoggers;

  constructor(loggers: ILoggers) {
    this.loggers = loggers;
  }

  /**
   * the onData handler
   * takes the data buffer and creates a IRawPacket object
   *
   * @param {Buffer} data
   * @param {Connection} connection
   * @param {IServerConfiguration} config
   */
  public async _onData(
    data: Buffer,
    connection: Connection,
    config: IServerConfiguration
  ) {
    try {
      const { localPort, remoteAddress } = connection.sock;
      const rawPacket: IRawPacket = {
        connection,
        data,
        localPort,
        remoteAddress,
        timestamp: Date.now(),
      };
      // Dump the raw packet
      this.loggers.both.debug(
        `rawPacket's data prior to proccessing: ${rawPacket.data.toString(
          "hex"
        )}`
      );

      const newConnection = await connection.mgr.processData(rawPacket, config);
      if (!connection.remoteAddress) {
        throw new Error("Remote address is empty");
      }
      await connection.mgr._updateConnectionByAddressAndPort(
        connection.remoteAddress,
        connection.localPort,
        newConnection
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * server listener method
   *
   * @param {net.Socket} socket
   * @param {ConnectionMgr} connectionMgr
   * @param {IServerConfiguration} config
   * @memberof ListenerThread
   */
  public _listener(
    socket: net.Socket,
    connectionMgr: ConnectionMgr,
    config: IServerConfiguration
  ) {
    // Received a new connection
    // Turn it into a connection object
    const connection = connectionMgr.findOrNewConnection(socket);

    const { localPort, remoteAddress } = socket;
    this.loggers.both.info(
      `[listenerThread] Client ${remoteAddress} connected to port ${localPort}`
    );
    if (socket.localPort === 7003 && connection.inQueue) {
      sendPacketOkLogin(socket);
      connection.inQueue = false;
    }
    socket.on("end", () => {
      this.loggers.both.info(
        `[listenerThread] Client ${remoteAddress} disconnected from port ${localPort}`
      );
    });
    socket.on("data", data => {
      this._onData(data, connection, config);
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "ECONNRESET") {
        throw err;
      }
    });
  }

  /**
   * Given a port and a connection manager object,
   * create a new TCP socket listener for that port
   *
   * @export
   * @param {number} localPort
   * @param {ConnectionMgr} connectionMgr
   * @param {IServerConfiguration} config
   */
  public async startTCPListener(
    localPort: number,
    connectionMgr: ConnectionMgr,
    config: IServerConfiguration
  ) {
    net
      .createServer(socket => {
        this._listener(socket, connectionMgr, config);
      })
      .listen({ port: localPort, host: "0.0.0.0" });
  }
}
