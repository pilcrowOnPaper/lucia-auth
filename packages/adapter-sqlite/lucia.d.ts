/// <reference types="lucia-auth" />
declare global {
	namespace Lucia {
		type Auth = any;
		type UserAttributes = {
			username: string;
		};
	}
}

export {};
