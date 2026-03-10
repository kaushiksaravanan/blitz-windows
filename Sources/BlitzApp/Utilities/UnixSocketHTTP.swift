import Foundation

/// HTTP client that communicates over a Unix domain socket
actor UnixSocketHTTP {
    let socketPath: String

    init(socketPath: String) {
        self.socketPath = socketPath
    }

    struct Response {
        let statusCode: Int
        let data: Data
    }

    /// Perform an HTTP request over the Unix socket
    func request(
        method: String,
        path: String,
        body: Data? = nil,
        headers: [String: String] = [:]
    ) async throws -> Response {
        // Build raw HTTP request
        var httpRequest = "\(method) \(path) HTTP/1.1\r\n"
        httpRequest += "Host: localhost\r\n"
        httpRequest += "Connection: close\r\n"

        var allHeaders = headers
        if let body {
            allHeaders["Content-Length"] = "\(body.count)"
            if allHeaders["Content-Type"] == nil {
                allHeaders["Content-Type"] = "application/json"
            }
        }

        for (key, value) in allHeaders {
            httpRequest += "\(key): \(value)\r\n"
        }
        httpRequest += "\r\n"

        var requestData = Data(httpRequest.utf8)
        if let body {
            requestData.append(body)
        }

        // Connect to Unix socket
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else {
            throw SocketError.connectionFailed("Failed to create socket")
        }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = socketPath.utf8CString
        withUnsafeMutablePointer(to: &addr.sun_path) { sunPath in
            pathBytes.withUnsafeBufferPointer { buf in
                let ptr = sunPath.withMemoryRebound(to: CChar.self, capacity: 104) { $0 }
                for i in 0..<min(buf.count, 104) {
                    ptr[i] = buf[i]
                }
            }
        }

        let connectResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                connect(fd, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }

        guard connectResult == 0 else {
            close(fd)
            throw SocketError.connectionFailed("Failed to connect to \(socketPath)")
        }

        // Send request
        requestData.withUnsafeBytes { buf in
            _ = send(fd, buf.baseAddress!, buf.count, 0)
        }

        // Read response
        var responseData = Data()
        let bufferSize = 4096
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer {
            buffer.deallocate()
            close(fd)
        }

        while true {
            let bytesRead = recv(fd, buffer, bufferSize, 0)
            if bytesRead <= 0 { break }
            responseData.append(buffer, count: bytesRead)
        }

        // Parse HTTP response
        guard let responseString = String(data: responseData, encoding: .utf8) else {
            throw SocketError.invalidResponse
        }

        // Split headers and body
        guard let headerEnd = responseString.range(of: "\r\n\r\n") else {
            throw SocketError.invalidResponse
        }

        let headerPart = String(responseString[..<headerEnd.lowerBound])
        let bodyStart = responseData.count - responseString[headerEnd.upperBound...].utf8.count
        let bodyData = responseData.subdata(in: bodyStart..<responseData.count)

        // Parse status code
        let statusLine = headerPart.components(separatedBy: "\r\n").first ?? ""
        let statusParts = statusLine.components(separatedBy: " ")
        let statusCode = statusParts.count >= 2 ? Int(statusParts[1]) ?? 0 : 0

        return Response(statusCode: statusCode, data: bodyData)
    }

    /// Convenience: GET request returning decoded JSON
    func get<T: Decodable>(_ path: String) async throws -> T {
        let response = try await request(method: "GET", path: path)
        return try JSONDecoder().decode(T.self, from: response.data)
    }

    /// Convenience: POST request with Encodable body, returning decoded JSON
    func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        let bodyData = try JSONEncoder().encode(body)
        let response = try await request(method: "POST", path: path, body: bodyData)
        return try JSONDecoder().decode(T.self, from: response.data)
    }

    /// Convenience: POST request with Encodable body, ignoring response
    func post<B: Encodable>(_ path: String, body: B) async throws {
        let bodyData = try JSONEncoder().encode(body)
        _ = try await request(method: "POST", path: path, body: bodyData)
    }

    enum SocketError: Error, LocalizedError {
        case connectionFailed(String)
        case invalidResponse

        var errorDescription: String? {
            switch self {
            case .connectionFailed(let msg): return msg
            case .invalidResponse: return "Invalid HTTP response from socket"
            }
        }
    }
}
