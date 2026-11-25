'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { FormMsg, Submit } from '@/components/ui';
import { forgot, newPassword, signIn, signUp } from './actions';

export function SignInForm({ next }: { next?: string }) {
  const [s, act] = useActionState(signIn, null);
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="next" value={next || '/app'} />
      <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
      <div><label className="label" htmlFor="password">Senha</label><input id="password" name="password" type="password" autoComplete="current-password" required className="field" /></div>
      <FormMsg state={s} />
      <Submit className="w-full" pending="Entrando...">Entrar</Submit>
      <div className="flex justify-between text-sm"><Link className="text-slate-600 underline" href="/recuperar">Esqueci a senha</Link><Link className="font-semibold underline" href="/cadastro">Criar conta</Link></div>
    </form>
  );
}

export function SignUpForm() {
  const [s, act] = useActionState(signUp, null);
  return (
    <form action={act} className="space-y-4">
      <div><label className="label" htmlFor="full_name">Seu nome</label><input id="full_name" name="full_name" autoComplete="name" required className="field" /></div>
      <div><label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
      <div><label className="label" htmlFor="password">Senha (mínimo 8 caracteres)</label><input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required className="field" /></div>
      <FormMsg state={s} />
      <Submit className="w-full" pending="Criando...">Criar conta e testar 7 dias</Submit>
      <p className="text-center text-xs text-slate-500">Ao criar a conta você concorda com os <Link className="underline" href="/termos">Termos</Link> e a <Link className="underline" href="/privacidade">Política de Privacidade</Link>.</p>
      <p className="text-center text-sm">Já tem conta? <Link className="font-semibold underline" href="/entrar">Entrar</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [s, act] = useActionState(forgot, null);
  return (
    <form action={act} className="space-y-4">
      <div><label className="label" htmlFor="email">E-mail da conta</label><input id="email" name="email" type="email" required className="field" /></div>
      <FormMsg state={s} />
      <Submit className="w-full" pending="Enviando...">Enviar link</Submit>
      <p className="text-center text-sm"><Link className="underline" href="/entrar">Voltar para o login</Link></p>
    </form>
  );
}

export function NewPasswordForm({ next }: { next?: string }) {
  const [s, act] = useActionState(newPassword, null);
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="next" value={next || '/app'} />
      <div><label className="label" htmlFor="password">Nova senha</label><input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required className="field" /></div>
      <FormMsg state={s} />
      <Submit className="w-full">Salvar senha</Submit>
    </form>
  );
}
