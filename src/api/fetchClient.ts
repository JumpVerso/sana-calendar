export const fetchClient = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const config = {
        ...init,
        credentials: 'include' as RequestCredentials, // Always include credentials
    };

    const response = await fetch(input, config);

    if (response.status === 401) {
        // Dispatch global event for unauthorized access
        window.dispatchEvent(new CustomEvent('unauthorized'));
    }

    return response;
};
