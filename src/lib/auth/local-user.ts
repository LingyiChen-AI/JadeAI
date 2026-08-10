/**
 * The desktop client has exactly one user. Its id is a fixed string rather than
 * a random UUID so that exported JSON carries a stable userId — importing an
 * export on another machine then needs no foreign-key rewriting.
 */
export const LOCAL_USER_ID = 'local';

export const LOCAL_USER_NAME = '本机用户';
